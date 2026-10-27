import { describe, expect, it, vi } from "vitest";
import { createClassroomConnection } from "./LiveClassRoom";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

function fixture(role: "teacher" | "student" = "student") {
  const events = new Map<string, (payload: any) => void>();
  const users = [{ userId: 100, displayName: "You", isHost: role === "teacher", muted: true, bVideoOn: false }, { userId: 200, displayName: "Teacher", bVideoOn: true }];
  const player = () => ({ nodeType: 1, remove: vi.fn() });
  const stream = {
    attachVideo: vi.fn(async () => player()), detachVideo: vi.fn(async () => []),
    attachShareView: vi.fn(async () => player()), detachShareView: vi.fn(async () => []),
    getActiveShareUserId: vi.fn(() => 200), isStartShareScreenWithVideoElement: vi.fn(() => false),
    startAudio: vi.fn(async () => undefined), muteAudio: vi.fn(async () => undefined), unmuteAudio: vi.fn(async () => undefined),
    startVideo: vi.fn(async () => undefined), stopVideo: vi.fn(async () => undefined),
    startShareScreen: vi.fn(async () => undefined), stopShareScreen: vi.fn(async () => undefined), muteAllAudio: vi.fn(async () => undefined),
  };
  const client = {
    init: vi.fn(async () => undefined), join: vi.fn(async () => undefined), leave: vi.fn(async () => undefined),
    getMediaStream: () => stream, getAllUser: () => users, getCurrentUserInfo: () => users[0], isHost: () => role === "teacher",
    removeUser: vi.fn(async () => undefined),
    on: vi.fn((event: string, fn: (payload: any) => void) => { events.set(event, fn); }),
    off: vi.fn((event: string) => { events.delete(event); }),
  };
  const paths: string[] = [];
  const request = vi.fn(async (url: any) => {
    paths.push(String(url).split("/").pop()!);
    const data = String(url).endsWith("/join") ? { attendance: { id: 12 }, live_class: { title: "Class" }, participants: [] } : { topic: "topic", token: "token" };
    return { ok: true, json: async () => ({ success: true, data }) } as Response;
  });
  const videoMount = { appendChild: vi.fn() };
  const shareMount = { appendChild: vi.fn() };
  const options = {
    classId: "9", user: { id: 1, name: "You", role },
    videoMount: () => videoMount as unknown as HTMLElement, shareMount: () => shareMount as unknown as HTMLElement,
    onJoined: vi.fn(), onParticipants: vi.fn(), onReady: vi.fn(), onShare: vi.fn(), onMicrophone: vi.fn(), onNotice: vi.fn(), onError: vi.fn(),
    request: request as typeof fetch,
    loadSdk: vi.fn(async () => ({ default: { createClient: () => client }, VideoQuality: { Video_360P: 2 } }) as any),
  };
  return { options, client, stream, paths, request, events, users, videoMount, shareMount };
}

async function flush() { await new Promise((resolve) => setImmediate(resolve)); }

describe("classroom session lifecycle", () => {
  it("starts a teacher's class before joining and displays existing peer video and screen share", async () => {
    const f = fixture("teacher");
    const connection = createClassroomConnection(f.options);
    await connection.ready;
    expect(f.paths).toEqual(["start", "join", "video-sdk-token"]);
    expect(f.stream.attachVideo).toHaveBeenCalledWith(200, 2);
    expect(f.videoMount.appendChild).toHaveBeenCalledTimes(1);
    expect(f.stream.attachShareView).toHaveBeenCalledWith(200);
    expect(f.shareMount.appendChild).toHaveBeenCalledTimes(1);
    expect(f.stream.startAudio).toHaveBeenCalledWith({ mute: true });
    expect(f.options.onReady).toHaveBeenCalledTimes(1);
    await connection.stop();
  });

  it("does not attempt to start a class when a student joins", async () => {
    const f = fixture();
    const connection = createClassroomConnection(f.options);
    await connection.ready;
    expect(f.paths).toEqual(["join", "video-sdk-token"]);
    await connection.stop();
  });

  it("closes attendance if unmounted while its join request is pending", async () => {
    const f = fixture();
    const joinResponse = deferred<Response>();
    f.request.mockImplementationOnce(() => joinResponse.promise);
    const connection = createClassroomConnection(f.options);
    await connection.stop();
    joinResponse.resolve({ ok: true, json: async () => ({ success: true, data: { attendance: { id: 22 } } }) } as Response);
    await connection.ready;
    expect(f.request).toHaveBeenLastCalledWith(expect.stringContaining("/leave"), expect.objectContaining({ body: JSON.stringify({ attendance_id: 22 }) }));
    expect(f.options.loadSdk).not.toHaveBeenCalled();
    expect(f.options.onJoined).not.toHaveBeenCalled();
  });

  it("leaves a late SDK join after unmount and sends attendance leave only once", async () => {
    const f = fixture();
    const joined = deferred<undefined>();
    f.client.join.mockImplementationOnce(() => joined.promise);
    const connection = createClassroomConnection(f.options);
    await flush();
    expect(f.client.join).toHaveBeenCalledTimes(1);
    await connection.stop();
    joined.resolve(undefined);
    await connection.ready;
    expect(f.client.leave).toHaveBeenCalledTimes(1);
    expect(f.paths.filter((path) => path === "leave")).toHaveLength(1);
    expect(f.options.onReady).not.toHaveBeenCalled();
  });

  it("updates remote video, share and participants from SDK events", async () => {
    const f = fixture();
    const connection = createClassroomConnection(f.options);
    await connection.ready;
    f.events.get("peer-video-state-change")!({ userId: 300, action: "Start" });
    await flush();
    expect(f.stream.attachVideo).toHaveBeenCalledWith(300, 2);
    f.events.get("peer-video-state-change")!({ userId: 300, action: "Stop" });
    expect(f.stream.detachVideo).toHaveBeenCalledWith(300);
    f.events.get("active-share-change")!({ userId: 400, state: "Active" });
    await flush();
    expect(f.stream.detachShareView).toHaveBeenCalledWith(200);
    expect(f.stream.attachShareView).toHaveBeenCalledWith(400);
    f.users.push({ userId: 300, displayName: "New student", bVideoOn: false });
    f.events.get("user-added")!([]);
    expect(f.options.onParticipants).toHaveBeenLastCalledWith(f.users, 100, false);
    await connection.stop();
    expect(f.events.size).toBe(0);
  });

  it("uses SDK moderation, actually stops sharing, and keeps receiving audio when muted", async () => {
    const f = fixture("teacher");
    const connection = createClassroomConnection(f.options);
    await connection.ready;
    const surface = {} as HTMLCanvasElement;
    await connection.setScreenShare(true, surface);
    await connection.setScreenShare(false, surface);
    expect(f.stream.startShareScreen).toHaveBeenCalledWith(surface);
    expect(f.stream.stopShareScreen).toHaveBeenCalledTimes(1);
    await connection.muteAll();
    await connection.muteParticipant(200);
    await connection.removeParticipant(200);
    expect(f.stream.muteAllAudio).toHaveBeenCalledTimes(1);
    expect(f.stream.muteAudio).toHaveBeenCalledWith(200);
    expect(f.client.removeUser).toHaveBeenCalledWith(200);
    await connection.setMicrophone(true);
    await connection.setMicrophone(false);
    expect(f.stream.unmuteAudio).toHaveBeenCalledTimes(1);
    expect(f.stream.muteAudio).toHaveBeenCalledWith();
    await connection.stop();
  });

  it("selects a video preview when required by the browser's sharing implementation", async () => {
    const f = fixture("teacher");
    f.stream.isStartShareScreenWithVideoElement.mockReturnValue(true);
    const connection = createClassroomConnection(f.options);
    await connection.ready;
    const canvas = {} as HTMLCanvasElement;
    const video = {} as HTMLVideoElement;
    expect(await connection.setScreenShare(true, canvas, video)).toBe(true);
    expect(f.stream.startShareScreen).toHaveBeenCalledWith(video);
    await connection.stop();
    expect(f.stream.stopShareScreen).toHaveBeenCalledTimes(1);
  });

  it("ends the backend class and SDK session together without a false disconnect error", async () => {
    const f = fixture("teacher");
    const connection = createClassroomConnection(f.options);
    await connection.ready;
    await connection.end();
    expect(f.paths).toContain("end");
    expect(f.client.leave).toHaveBeenCalledExactlyOnceWith(true);
    expect(f.options.onError).not.toHaveBeenCalled();
    expect(f.events.size).toBe(0);
  });

  it("cleans attendance when authorization fails after the API join", async () => {
    const f = fixture();
    f.request.mockImplementationOnce(async () => ({ ok: true, json: async () => ({ success: true, data: { attendance: { id: 23 } } }) }) as Response)
      .mockImplementationOnce(async () => ({ ok: false, json: async () => ({ success: false, error: "Not authorized" }) }) as Response);
    const connection = createClassroomConnection(f.options);
    await connection.ready;
    expect(f.options.onError).toHaveBeenCalledWith("Not authorized");
    expect(f.paths).toEqual(["leave"]);
    expect(f.options.onReady).not.toHaveBeenCalled();
  });
});
