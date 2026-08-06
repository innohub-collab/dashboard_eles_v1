import { act } from "react";
import { createRoot } from "react-dom/client";
import DeboraWidget from "./DeboraWidget";

jest.mock("axios", () => ({ post: jest.fn() }));

describe("DeboraWidget layout", () => {
  let container;
  let root;
  let originalScrollIntoView;

  beforeEach(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
    originalScrollIntoView = window.HTMLElement.prototype.scrollIntoView;
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    window.localStorage.clear();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.localStorage.clear();
    window.HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  test("long answers and source paths stay inside the widget width", () => {
    const longToken = "calculate_weighted_score/".repeat(40);
    window.localStorage.setItem(
      "innolab.debora.widget.v1",
      JSON.stringify({
        open: true,
        messages: [
          {
            role: "assistant",
            content: `Hosszú válasz: ${longToken}`,
            sources: [
              {
                sourceId: "SRC_layout",
                path: `frontend/src/${longToken}.jsx`,
                startLine: 1,
                endLine: 20,
                symbol: "DeboraLayoutTest",
              },
            ],
          },
        ],
      }),
    );

    act(() => root.render(<DeboraWidget />));

    const messages = container.querySelector('[data-testid="debora-messages"]');
    const bubble = container.querySelector('[data-testid="debora-message-content"]');
    const sourcePath = container.querySelector('[data-testid="debora-sources"] .break-all');

    expect(messages.className).toContain("overflow-x-hidden");
    expect(bubble.className).toContain("max-w-full");
    expect(bubble.className).toContain("[overflow-wrap:anywhere]");
    expect(sourcePath.className).toContain("break-all");
    expect(bubble.textContent).toContain(longToken);
  });
});
