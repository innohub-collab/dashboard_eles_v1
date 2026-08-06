import { act } from "react";
import { createRoot } from "react-dom/client";
import { ProgramCard } from "./Programs";

const idea = (id, outcome) => ({
  id,
  cim: `Tesztötlet ${id}`,
  letrehozva: "2026-08-01",
  allapot: outcome === "Nyitott" ? "Rögzítve" : "Lezárva",
  outcome,
});

describe("ProgramCard", () => {
  let container;
  let root;

  beforeEach(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test("keeps every idea in a fixed-height, scrollable card", () => {
    const items = Array.from({ length: 142 }, (_, index) => idea(`IDEA-${index + 1}`, "Nyitott"));

    act(() => root.render(<ProgramCard name="VIP" items={items} onOpen={jest.fn()} />));

    const card = container.querySelector('[data-testid="program-card-VIP"]');
    const list = container.querySelector('[data-testid="program-items-VIP"]');

    expect(card.className).toContain("h-[520px]");
    expect(card.className).toContain("flex-col");
    expect(list.className).toContain("overflow-y-auto");
    expect(list.className).toContain("flex-1");
    expect(list.getAttribute("tabindex")).toBe("0");
    expect(container.querySelectorAll('[data-testid^="program-item-"]')).toHaveLength(142);
  });

  test("status chips filter the card and can be toggled off", () => {
    const items = [
      idea("DONE-1", "Megvalósítva"),
      idea("OPEN-1", "Nyitott"),
      idea("OPEN-2", "Nyitott"),
      idea("REJECTED-1", "Elutasítva"),
    ];

    act(() => root.render(<ProgramCard name="Mentor" items={items} onOpen={jest.fn()} />));

    const doneChip = container.querySelector('[data-testid="program-chip-Mentor-Megvalósítva"]');
    expect(doneChip).not.toBeNull();

    act(() => doneChip.click());
    expect(doneChip.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelectorAll('[data-testid^="program-item-"]')).toHaveLength(1);
    expect(container.querySelector('[data-testid="program-item-DONE-1"]')).not.toBeNull();

    act(() => doneChip.click());
    expect(doneChip.getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelectorAll('[data-testid^="program-item-"]')).toHaveLength(4);
  });
});
