// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { usePlanDerived } from "@/hooks/usePlanDerived";

function UnwrappedConsumer() {
  usePlanDerived();
  return null;
}

it("requires one shared PlanDerivedProvider", () => {
  expect(() => render(<UnwrappedConsumer />)).toThrow(
    "usePlanDerived requires PlanDerivedProvider",
  );
});
