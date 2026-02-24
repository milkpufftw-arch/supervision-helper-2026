import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import { saveAs } from "file-saver";

export async function exportToWord(markdown: string) {
  // Simple markdown to docx converter
  // This is a basic implementation that handles headers and paragraphs
  const lines = markdown.split("\n");
  const children: any[] = [];

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) {
      children.push(
        new Paragraph({
          text: trimmed.replace("# ", ""),
          heading: HeadingLevel.HEADING_1,
        })
      );
    } else if (trimmed.startsWith("## ")) {
      children.push(
        new Paragraph({
          text: trimmed.replace("## ", ""),
          heading: HeadingLevel.HEADING_2,
        })
      );
    } else if (trimmed.startsWith("### ")) {
      children.push(
        new Paragraph({
          text: trimmed.replace("### ", ""),
          heading: HeadingLevel.HEADING_3,
        })
      );
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      children.push(
        new Paragraph({
          text: trimmed.substring(2),
          bullet: { level: 0 },
        })
      );
    } else if (trimmed.length > 0) {
      children.push(
        new Paragraph({
          children: [new TextRun(trimmed)],
        })
      );
    } else {
      children.push(new Paragraph({ text: "" }));
    }
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, "督導紀錄表.docx");
}
