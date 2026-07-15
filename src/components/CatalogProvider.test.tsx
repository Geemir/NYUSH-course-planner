// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { useCatalog } from "@/components/CatalogProvider";
import type { PlannerProgram } from "@/lib/requirements";

function CatalogProgramSummary() {
  const catalog = useCatalog() as ReturnType<typeof useCatalog> & {
    programsById?: ReadonlyMap<string, PlannerProgram>;
  };
  const firstProgram = catalog.programs[0];

  return (
    <p>
      {catalog.programsById?.get(firstProgram.id)?.name ?? "missing program map"}
    </p>
  );
}

it("exposes catalog programs by id", () => {
  render(<CatalogProgramSummary />);

  expect(screen.queryByText("missing program map")).toBeNull();
});
