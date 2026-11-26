import { describe, expect, it, vi } from "vitest";
import { createClassroomConnection } from "./LiveClassRoom";

function createOptions(role: "teacher" | "student" = "student") {
  return {
    classId: "12",
    user: { id: "22", name: "Test participant", role },
    onRoom: vi.fn(),
    onChat: vi.fn(),
    onRemoteAudio: vi.fn(),
    onRemoteScreen: vi.fn(),
    onNotice: vi.fn(),
    onClosed: vi.fn(),
  };
}

describe("native EduLearnX classroom connection", () => {
  it("exposes audio, chat, screen-share and teacher moderation controls", () => {
    const connection = createClassroomConnection(createOptions("teacher"));
    expect(connection).toEqual(expect.objectContaining({
      start: expect.any(Function),
      setMicrophone: expect.any(Function),
      setScreenShare: expect.any(Function),
      sendChat: expect.any(Function),
      muteParticipant: expect.any(Function),
      removeParticipant: expect.any(Function),
      endClass: expect.any(Function),
      stop: expect.any(Function),
    }));
  });

  it("allows students to use the same connection without adding camera controls", () => {
    const connection = createClassroomConnection(createOptions("student"));
    expect(connection.setMicrophone).toBeTypeOf("function");
    expect(connection.sendChat).toBeTypeOf("function");
    expect(connection.setScreenShare).toBeTypeOf("function");
    expect("setCamera" in connection).toBe(false);
  });

  it("can clean up safely before a class has finished joining", async () => {
    const connection = createClassroomConnection(createOptions());
    await expect(connection.stop()).resolves.toBeUndefined();
    await expect(connection.stop()).resolves.toBeUndefined();
  });
});
