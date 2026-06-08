import { describe, expect, it } from "vitest";
import { getAShareMarketSession } from "./index";

describe("getAShareMarketSession", () => {
  it("marks regular trading hours as open", () => {
    const session = getAShareMarketSession(new Date("2026-06-08T10:00:00+08:00"));

    expect(session.label).toBe("交易时间");
    expect(session.sessionName).toBe("连续竞价");
    expect(session.isOpen).toBe(true);
  });

  it("marks the midday break as market closed", () => {
    const session = getAShareMarketSession(new Date("2026-06-08T12:00:00+08:00"));

    expect(session.label).toBe("休盘时间");
    expect(session.sessionName).toBe("午间休市");
    expect(session.isOpen).toBe(false);
  });

  it("marks evening time as after-market closed", () => {
    const session = getAShareMarketSession(new Date("2026-06-08T21:13:30+08:00"));

    expect(session.label).toBe("休盘时间");
    expect(session.sessionName).toBe("盘后休市");
    expect(session.isOpen).toBe(false);
    expect(session.showAfterMarketAnalysis).toBe(true);
  });
});
