import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { EditorCanvas } from "@/components/track-editor/editor-canvas";
import { STARTER_DOC, placeTile, type EditorDoc } from "@/lib/track-editor-model";

export const Route = createFileRoute("/__editor-probe")({ component: Probe });

function Probe() {
  const [doc, setDoc] = useState<EditorDoc>(STARTER_DOC);
  return (
    <EditorCanvas
      data={doc.data}
      level={0}
      selection={doc.selection}
      tool="paint"
      activeType="straight"
      rot={1}
      showGhosts
      onPaint={(x, z) => setDoc((d) => placeTile(d, x, z, 0, "straight", 1))}
      onErase={() => {}}
      onSelect={() => {}}
      onMoveSelection={() => {}}
    />
  );
}
