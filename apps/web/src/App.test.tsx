import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("switches strategy builder modes without leaving the workspace", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "虚拟交易工作台" })).toBeInTheDocument();
    expect(screen.getByText("结构化规则编辑器")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "画布模块" }));
    expect(screen.getByText("股票池 → 买入规则 → 仓位控制 → 风控规则")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "AI 助手" }));
    expect(screen.getByText("AI 只生成草案，用户确认后进入发布流程。")).toBeInTheDocument();
  });
});
