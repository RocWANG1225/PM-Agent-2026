#!/usr/bin/env python3
import json
import re
import string
import subprocess
import sys
import zlib
from datetime import date
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET


NS = {
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
REL_NS = {"rel": "http://schemas.openxmlformats.org/package/2006/relationships"}


def parse_date(value):
    value = value.strip()
    m = re.match(r"(?:(20)?(\d{2})[./年-])(\d{1,2})[./月-](\d{1,2})", value)
    if m:
        year = int(("20" if not m.group(1) else m.group(1)) + m.group(2))
        try:
            return date(year, int(m.group(3)), int(m.group(4)))
        except ValueError:
            return None
    m = re.match(r"(\d{1,2})[./月-](\d{1,2})", value)
    if m:
        try:
            return date(date.today().year, int(m.group(1)), int(m.group(2)))
        except ValueError:
            return None
    return None


def extract_pptx_text(pptx):
    slides = []
    with ZipFile(pptx) as zf:
        pres = ET.fromstring(zf.read("ppt/presentation.xml"))
        rels = ET.fromstring(zf.read("ppt/_rels/presentation.xml.rels"))
        rid_to_target = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels.findall("rel:Relationship", REL_NS)}
        for idx, sld_id in enumerate(pres.findall(".//p:sldIdLst/p:sldId", NS), start=1):
            rid = sld_id.attrib[f"{{{NS['r']}}}id"]
            target = rid_to_target[rid]
            slide_path = str(Path("ppt") / target)
            xml = ET.fromstring(zf.read(slide_path))
            texts = [node.text.strip() for node in xml.findall(".//a:t", NS) if node.text and node.text.strip()]
            slides.append({"index": idx, "text": "\n".join(texts)})
    return slides


def decode_pdf_literal(value):
    out = []
    i = 0
    while i < len(value):
        ch = value[i]
        if ch == "\\" and i + 1 < len(value):
            nxt = value[i + 1]
            mapped = {"n": "\n", "r": "\r", "t": "\t", "b": "\b", "f": "\f", "\\": "\\", "(": "(", ")": ")"}
            out.append(mapped.get(nxt, nxt))
            i += 2
        else:
            out.append(ch)
            i += 1
    return "".join(out)


def decode_pdf_hex(value):
    value = re.sub(r"\s+", "", value)
    if len(value) % 2:
        value += "0"
    try:
        raw = bytes.fromhex(value)
    except ValueError:
        return ""
    for encoding in ("utf-16-be", "utf-16-le", "utf-8", "latin-1"):
        try:
            text = raw.decode(encoding)
            if any(ch in text for ch in "议题日期内容回复") or sum(ch in string.printable for ch in text) >= max(1, len(text) // 2):
                return text
        except UnicodeDecodeError:
            pass
    return ""


def extract_text_operators(text):
    values = []
    for match in re.finditer(r"\((?:\\.|[^\\)])*\)\s*Tj", text, re.S):
        values.append(decode_pdf_literal(match.group(0)[1: match.group(0).rfind(")")]))
    for match in re.finditer(r"<([0-9A-Fa-f\s]+)>\s*Tj", text, re.S):
        values.append(decode_pdf_hex(match.group(1)))
    for match in re.finditer(r"\[(.*?)\]\s*TJ", text, re.S):
        segment = match.group(1)
        parts = []
        for literal in re.finditer(r"\((?:\\.|[^\\)])*\)|<([0-9A-Fa-f\s]+)>", segment, re.S):
            token = literal.group(0)
            if token.startswith("("):
                parts.append(decode_pdf_literal(token[1:-1]))
            elif token.startswith("<"):
                parts.append(decode_pdf_hex(token[1:-1]))
        values.append("".join(parts))
    return "\n".join(v for v in values if v.strip())


def extract_pdf_with_mdls(pdf):
    try:
        result = subprocess.run(
            ["mdls", "-raw", "-name", "kMDItemTextContent", str(pdf)],
            check=False,
            capture_output=True,
            text=True,
            timeout=20,
        )
    except (FileNotFoundError, subprocess.SubprocessError):
        return ""
    text = result.stdout.strip()
    if not text or text == "(null)":
        return ""
    return text


def extract_pdf_text(pdf):
    try:
        from pypdf import PdfReader

        reader = PdfReader(str(pdf))
        pages = []
        for idx, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""
            if text.strip():
                pages.append({"index": idx, "text": text})
        if pages:
            return pages
    except Exception:
        pass

    spotlight_text = extract_pdf_with_mdls(pdf)
    if spotlight_text:
        return [{"index": 1, "text": spotlight_text}]

    data = Path(pdf).read_bytes()
    pages = []
    for idx, match in enumerate(re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", data, re.S), start=1):
        raw = match.group(1).strip(b"\r\n")
        prefix = data[max(0, match.start() - 500): match.start()]
        if b"FlateDecode" in prefix:
            try:
                raw = zlib.decompress(raw)
            except zlib.error:
                continue
        try:
            stream_text = raw.decode("latin-1", errors="ignore")
        except UnicodeDecodeError:
            continue
        extracted = extract_text_operators(stream_text)
        if extracted.strip():
            pages.append({"index": idx, "text": extracted})
    return pages


def extract_text(source):
    suffix = Path(source).suffix.lower()
    if suffix == ".pptx":
        return extract_pptx_text(source)
    if suffix == ".pdf":
        return extract_pdf_text(source)
    raise ValueError("仅支持 .pptx 和 .pdf 文件。")


def summarize(text):
    compact = " ".join(text.split())
    title = next((line for line in text.splitlines() if "议题" in line), "")
    risks = []
    for keyword in ["Risk", "risk", "风险", "影响", "延期", "阻塞"]:
        if keyword in compact:
            risks.append(compact[max(0, compact.find(keyword) - 40): compact.find(keyword) + 120])
    return title, compact[:220] + ("..." if len(compact) > 220 else ""), risks[:3]


def main():
    if len(sys.argv) != 4:
        raise SystemExit("Usage: extract_pptx_weekly.py <pptx> <week-start> <week-end>")
    pptx = Path(sys.argv[1])
    start = date.fromisoformat(sys.argv[2])
    end = date.fromisoformat(sys.argv[3])
    selected = []
    for slide in extract_text(pptx):
        text = slide["text"]
        if "议题" not in text:
            continue
        found_dates = [parse_date(token) for token in re.findall(r"(?:20)?\d{2}[./年-]\d{1,2}[./月-]\d{1,2}|\d{1,2}[./月-]\d{1,2}", text)]
        found_dates = [item for item in found_dates if item]
        if not any(start <= item <= end for item in found_dates):
            continue
        title, summary, risks = summarize(text)
        selected.append({
            "index": slide["index"],
            "sourceType": pptx.suffix.lower().lstrip("."),
            "title": title,
            "dates": [item.isoformat() for item in found_dates if start <= item <= end],
            "summary": summary,
            "risks": risks,
            "text": " ".join(text.split())[:4000],
        })
    print(json.dumps({"slides": selected}, ensure_ascii=False))


if __name__ == "__main__":
    main()
