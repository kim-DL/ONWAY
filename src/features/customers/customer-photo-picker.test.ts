import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CustomerPhotoPicker } from "./customer-photo-picker";

describe("photo preparation feedback", () => {
  it("keeps the preparation announcement outside any busy ancestor while retaining photo controls", () => {
    const html = renderToStaticMarkup(createElement(CustomerPhotoPicker, {
      customer: null,
      file: new File([new Uint8Array([1])], "synthetic.png", { type: "image/png" }),
      removed: false,
      disabled: false,
      onChange: () => undefined,
    }));
    expect(html).toContain("사진 준비 중");
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).not.toContain('aria-busy="true"');
    expect(html).toContain('aria-label="거래처 전경사진 촬영"');
    expect(html).toContain('aria-label="거래처 전경사진 선택"');
    expect(html).not.toContain('src="blob:');
  });
});
