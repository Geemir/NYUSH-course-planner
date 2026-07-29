"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { RequirementNode } from "@/lib/types";

const labels: Record<RequirementNode["kind"], string> = {
  course: "Course", all: "All of", any: "Any one", choose: "Choose a number",
  credits: "Minimum credits", attribute: "Course attribute", exclusion: "Exclusion",
  waiver: "Waiver", manualConfirmation: "Manual confirmation",
};

function childrenOf(node: RequirementNode): RequirementNode[] {
  return "children" in node ? node.children : [{ kind: "course", courseId: "COURSE-CODE" }];
}

function convert(node: RequirementNode, kind: RequirementNode["kind"]): RequirementNode {
  const children = childrenOf(node);
  switch (kind) {
    case "course": return { kind, courseId: node.kind === "course" ? node.courseId : "COURSE-CODE" };
    case "all": return { kind, children };
    case "any": return { kind, children };
    case "choose": return { kind, count: node.kind === "choose" ? node.count : 1, children };
    case "credits": return { kind, minimum: node.kind === "credits" ? node.minimum : 4, children };
    case "attribute": return { kind, attribute: node.kind === "attribute" ? node.attribute : "ATTRIBUTE" };
    case "exclusion": return { kind, excludedCourseIds: [], child: node };
    case "waiver": return { kind, waiverId: "advisor-waiver", label: "Advisor waiver" };
    case "manualConfirmation": return { kind, label: "Advisor confirmation", sourceText: "Verify against the Bulletin." };
  }
}

export function RequirementNodeEditor({ value, onChange, depth = 0 }: {
  value: RequirementNode;
  onChange: (value: RequirementNode) => void;
  depth?: number;
}) {
  const updateChild = (index: number, child: RequirementNode) => {
    if (!("children" in value)) return;
    onChange({ ...value, children: value.children.map((item, itemIndex) => itemIndex === index ? child : item) });
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-background p-3" data-depth={depth}>
      <Select value={value.kind} onValueChange={(kind) => onChange(convert(value, kind as RequirementNode["kind"]))}>
        <SelectTrigger aria-label="Requirement type" className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>{Object.entries(labels).map(([kind, label]) => <SelectItem key={kind} value={kind}>{label}</SelectItem>)}</SelectContent>
      </Select>

      {value.kind === "course" && <Input aria-label="Course code" value={value.courseId} onChange={(event) => onChange({ ...value, courseId: event.target.value })} />}
      {value.kind === "attribute" && <Input aria-label="Attribute" value={value.attribute} onChange={(event) => onChange({ ...value, attribute: event.target.value })} />}
      {value.kind === "choose" && <Input aria-label="Number required" type="number" min={1} value={value.count} onChange={(event) => onChange({ ...value, count: Math.max(1, Number(event.target.value)) })} />}
      {value.kind === "credits" && <Input aria-label="Minimum credits" type="number" min={0.5} step={0.5} value={value.minimum} onChange={(event) => onChange({ ...value, minimum: Math.max(0.5, Number(event.target.value)) })} />}
      {value.kind === "waiver" && <>
        <Input aria-label="Waiver id" value={value.waiverId} onChange={(event) => onChange({ ...value, waiverId: event.target.value })} />
        <Input aria-label="Waiver label" value={value.label} onChange={(event) => onChange({ ...value, label: event.target.value })} />
      </>}
      {value.kind === "manualConfirmation" && <>
        <Input aria-label="Confirmation label" value={value.label} onChange={(event) => onChange({ ...value, label: event.target.value })} />
        <Textarea aria-label="Source instruction" value={value.sourceText} onChange={(event) => onChange({ ...value, sourceText: event.target.value })} />
      </>}
      {value.kind === "exclusion" && <>
        <Input aria-label="Excluded course codes" value={value.excludedCourseIds.join(", ")} onChange={(event) => onChange({ ...value, excludedCourseIds: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} />
        <RequirementNodeEditor value={value.child} onChange={(child) => onChange({ ...value, child })} depth={depth + 1} />
      </>}
      {"children" in value && <div className="flex flex-col gap-2">
        {value.children.map((child, index) => <div key={index} className="flex items-start gap-2">
          <div className="min-w-0 flex-1"><RequirementNodeEditor value={child} onChange={(next) => updateChild(index, next)} depth={depth + 1} /></div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove requirement ${index + 1}`} onClick={() => onChange({ ...value, children: value.children.filter((_, itemIndex) => itemIndex !== index) } as RequirementNode)}><Trash2 /></Button>
        </div>)}
        <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...value, children: [...value.children, { kind: "course", courseId: "COURSE-CODE" }] } as RequirementNode)}><Plus /> Add requirement</Button>
      </div>}
    </div>
  );
}

