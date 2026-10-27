import { getCurrentPortalUser, type PortalUser } from "@/lib/portalData";
import type { LiveClassJoinResponse } from "@shared/api";
import type { Participant } from "@zoom/videosdk";
import { Camera, CameraOff, Crown, LogOut, Mic, MicOff, MonitorUp, ShieldCheck, UserRound, Users, Video, VolumeX, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

const VideoPlayerContainer = "video-player-container" as any;
type ZoomSdk = typeof import("@zoom/videosdk");
type ZoomClient = ReturnType<ZoomSdk["default"]["createClient"]>;
type ZoomStream = ReturnType<ZoomClient["getMediaStream"]>;

type ConnectionOptions = {
  classId: string;
  user: Pick<PortalUser, "id" | "name" | "role">;
  videoMount: () => HTMLElement | null;
  shareMount: () => HTMLElement | null;
  onJoined: (data: LiveClassJoinResponse) => void;
  onParticipants: (users: Participant[], ownId: number, isHost: boolean) => void;
  onReady: () => void;
  onShare: (sharing: boolean) => void;
  onMicrophone: (enabled: boolean) => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
  request?: typeof fetch;
  loadSdk?: () => Promise<ZoomSdk>;
};

/** Owns one session so late requests and SDK joins cannot outlive their component. */
export function createClassroomConnection(options: ConnectionOptions) {
  const request = options.request ?? fetch;
  let stopped = false;
  let attendanceId: number | null = null;
  let attendanceLeft = false;
  let client: ZoomClient | undefined;
  let stream: ZoomStream | undefined;
  let sdk: ZoomSdk | undefined;
  let connected = false;
  let audioStarted = false;
  let sharing = false;
  const listeners: Array<[string, (payload: any) => void]> = [];
  const videos = new Map<number, HTMLElement>();
  const videoVersions = new Map<number, number>();
  let sharePlayer: HTMLElement | undefined;
  let viewedShareId: number | undefined;
  let shareVersion = 0;

  async function api(path: string, body?: unknown) {
    const response = await request(`/api/live-classes/${options.classId}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to connect to this class.");
    return payload.data;
  }

  async function leaveAttendance() {
    if (attendanceId === null || attendanceLeft) return;
    attendanceLeft = true;
    try { await api("leave", { attendance_id: attendanceId }); } catch { /* Server also closes attendance when the class ends. */ }
  }

  async function detachVideo(userId: number) {
    videoVersions.set(userId, (videoVersions.get(userId) ?? 0) + 1);
    videos.get(userId)?.remove();
    videos.delete(userId);
    if (stream) await stream.detachVideo(userId).catch(() => undefined);
  }

  async function attachVideo(userId: number) {
    if (!stream || !sdk || stopped || videos.has(userId)) return;
    const version = (videoVersions.get(userId) ?? 0) + 1;
    videoVersions.set(userId, version);
    const player = await stream.attachVideo(userId, sdk.VideoQuality.Video_360P);
    if (!player || !("nodeType" in player)) return;
    if (stopped || videoVersions.get(userId) !== version) { player.remove(); return; }
    videos.set(userId, player);
    options.videoMount()?.appendChild(player);
  }

  async function updateShare(userId?: number) {
    const version = ++shareVersion;
    sharePlayer?.remove();
    sharePlayer = undefined;
    if (!stream) return;
    if (viewedShareId !== undefined) await stream.detachShareView(viewedShareId).catch(() => undefined);
    viewedShareId = undefined;
    if (!userId || stopped || userId === client?.getCurrentUserInfo().userId) return;
    const player = await stream.attachShareView(userId);
    if (!player || !("nodeType" in player)) return;
    if (stopped || shareVersion !== version) { player.remove(); return; }
    sharePlayer = player;
    viewedShareId = userId;
    options.shareMount()?.appendChild(player);
  }

  function updateParticipants() {
    if (!client || stopped) return;
    const own = client.getCurrentUserInfo();
    options.onParticipants([...client.getAllUser()], own.userId, client.isHost());
    options.onMicrophone(own.muted === false && audioStarted);
  }

  async function stop() {
    stopped = true;
    for (const [event, listener] of listeners.splice(0)) client?.off(event, listener);
    for (const id of [...videos.keys()]) await detachVideo(id);
    ++shareVersion;
    sharePlayer?.remove();
    sharePlayer = undefined;
    if (stream) {
      if (viewedShareId !== undefined) await stream.detachShareView(viewedShareId).catch(() => undefined);
      viewedShareId = undefined;
      if (sharing) await stream.stopShareScreen().catch(() => undefined);
      sharing = false;
    }
    if (client && connected) {
      connected = false;
      await client.leave().catch(() => undefined);
    }
    await leaveAttendance();
  }

  const ready = (async () => {
    try {
      // The server validates the actor; no user ID or role from the browser is trusted.
      if (options.user.role === "teacher") await api("start");
      if (stopped) return;
      const joined = await api("join") as LiveClassJoinResponse;
      attendanceId = joined.attendance.id;
      if (stopped) { await leaveAttendance(); return; }
      options.onJoined(joined);
      const token = await api("video-sdk-token");
      if (stopped) return;
      sdk = await (options.loadSdk ?? (() => import("@zoom/videosdk")))();
      if (stopped) return;
      client = sdk.default.createClient();
      await client.init("en-US", "Global", { patchJsMedia: true, stayAwake: true, leaveOnPageUnload: true });
      if (stopped) return;
      await client.join(token.topic, token.token, options.user.name);
      connected = true;
      stream = client.getMediaStream();
      if (stopped) { await stop(); return; }
      function listen(event: string, listener: (payload: any) => void) {
        // Event names and payloads match the installed Video SDK API.
        (client!.on as (event: string, listener: (payload: any) => void) => void)(event, listener);
        listeners.push([event, listener]);
      }
      const mediaFailure = () => { if (!stopped) options.onNotice("A participant's video could not be displayed."); };
      listen("user-added", updateParticipants);
      listen("user-updated", updateParticipants);
      listen("user-removed", (users: Array<{ userId: number }>) => {
        updateParticipants();
        for (const user of users) void detachVideo(user.userId);
      });
      listen("peer-video-state-change", ({ userId, action }: { userId: number; action: string }) => {
        void (action === "Start" ? attachVideo(userId) : detachVideo(userId)).catch(mediaFailure);
        updateParticipants();
      });
      listen("active-share-change", ({ state, userId }: { state: string; userId: number }) => {
        void updateShare(state === "Active" ? userId : undefined).catch(mediaFailure);
      });
      listen("passively-stop-share", () => { sharing = false; options.onShare(false); });
      listen("connection-change", ({ state, reason }: { state: string; reason?: string }) => {
        if (!stopped && (state === "Closed" || state === "Fail")) {
          void stop();
          options.onError(reason || "The meeting has ended.");
        }
      });
      updateParticipants();
      await Promise.all(client.getAllUser().filter((user) => user.bVideoOn).map((user) => attachVideo(user.userId).catch(mediaFailure)));
      await updateShare(stream.getActiveShareUserId()).catch(mediaFailure);
      try {
        // Join audio muted so students can hear the teacher without broadcasting.
        await stream.startAudio({ mute: true });
        audioStarted = true;
      } catch {
        if (!stopped) options.onNotice("Use Microphone to connect audio if your browser blocked automatic playback.");
      }
      if (stopped) { await stop(); return; }
      options.onReady();
    } catch (error) {
      if (!stopped) options.onError(error instanceof Error ? error.message : "Unable to join live class.");
      await stop();
    }
  })();

  function requireMedia() {
    if (!stream || !client || !connected || stopped) throw new Error("The meeting is still connecting.");
    return { stream, client };
  }

  return {
    ready, stop,
    async setCamera(enabled: boolean) {
      const { stream, client } = requireMedia();
      if (enabled) { await stream.startVideo(); await attachVideo(client.getCurrentUserInfo().userId); }
      else { await stream.stopVideo(); await detachVideo(client.getCurrentUserInfo().userId); }
    },
    async setMicrophone(enabled: boolean) {
      const { stream } = requireMedia();
      if (!audioStarted) { await stream.startAudio({ mute: !enabled }); audioStarted = true; }
      else if (enabled) await stream.unmuteAudio();
      else await stream.muteAudio();
      options.onMicrophone(enabled);
    },
    async setScreenShare(enabled: boolean, canvas: HTMLCanvasElement, video?: HTMLVideoElement) {
      const { stream } = requireMedia();
      const useVideo = stream.isStartShareScreenWithVideoElement();
      const surface = useVideo ? video : canvas;
      if (!surface) throw new Error("The screen sharing preview is unavailable.");
      if (enabled) await stream.startShareScreen(surface);
      else await stream.stopShareScreen();
      sharing = enabled;
      options.onShare(enabled);
      return useVideo;
    },
    async muteAll() { await requireMedia().stream.muteAllAudio(); },
    async muteParticipant(userId: number) { await requireMedia().stream.muteAudio(userId); },
    async removeParticipant(userId: number) { await requireMedia().client.removeUser(userId); },
    async end() {
      const { client } = requireMedia();
      await api("end");
      stopped = true;
      for (const [event, listener] of listeners.splice(0)) client.off(event, listener);
      connected = false;
      try { await client.leave(true); } finally { await stop(); }
    },
  };
}

type ClassroomConnection = ReturnType<typeof createClassroomConnection>;

export default function LiveClassRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const currentUser = getCurrentPortalUser();
  const userId = currentUser?.id;
  const userName = currentUser?.name ?? "";
  const userRole = currentUser?.role;
  const videoMountRef = useRef<HTMLDivElement | null>(null);
  const shareMountRef = useRef<HTMLDivElement | null>(null);
  const shareSurfaceRef = useRef<HTMLCanvasElement | null>(null);
  const shareVideoRef = useRef<HTMLVideoElement | null>(null);
  const connectionRef = useRef<ClassroomConnection | null>(null);
  const [joinData, setJoinData] = useState<LiveClassJoinResponse | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [ready, setReady] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [shareUsesVideo, setShareUsesVideo] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [ownZoomId, setOwnZoomId] = useState<number | null>(null);
  const [isHost, setIsHost] = useState(false);

  useEffect(() => {
    if (!id || userId === undefined || !userRole) {
      navigate("/signin", { replace: true });
      return;
    }
    setReady(false);
    setError("");
    setCameraOn(false);
    setMicOn(false);
    setScreenSharing(false);
    const connection = createClassroomConnection({
      classId: id, user: { id: userId, name: userName, role: userRole },
      videoMount: () => videoMountRef.current, shareMount: () => shareMountRef.current,
      onJoined: setJoinData, onReady: () => setReady(true), onShare: setScreenSharing,
      onMicrophone: setMicOn, onNotice: setNotice, onError: setError,
      onParticipants: (users, ownId, host) => { setParticipants(users); setOwnZoomId(ownId); setIsHost(host); },
    });
    connectionRef.current = connection;
    return () => {
      if (connectionRef.current === connection) connectionRef.current = null;
      void connection.stop();
    };
  }, [id, userId, userName, userRole, navigate]);

  const perform = async (action: (connection: ClassroomConnection) => Promise<void>, success?: string) => {
    if (!connectionRef.current) return;
    try { await action(connectionRef.current); if (success) setNotice(success); }
    catch (err) { setNotice(err instanceof Error ? err.message : "The meeting action failed."); }
  };
  const leaveRoom = () => navigate(userRole === "student" ? "/student/live-classes" : userRole === "admin" ? "/admin/live-classes" : "/teacher", { replace: true });

  if (error) return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
      <div className="max-w-md rounded-2xl border border-white/10 bg-white/10 p-6 text-center">
        <Video className="mx-auto mb-4 h-10 w-10 text-red-200" />
        <p className="font-semibold">{error}</p>
        <button onClick={leaveRoom} className="mt-5 rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-950">Back to classes</button>
      </div>
    </main>
  );

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10 bg-slate-900 px-4 py-4">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-200">Live Class</p>
            <h1 className="text-2xl font-bold">{joinData?.live_class.title || "Joining..."}</h1>
            <p className="text-sm text-slate-400">{joinData?.live_class.course_title}</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-blue-200">
              {isHost ? <Crown className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}
              {ready ? isHost ? "You are the meeting host" : "You joined as a participant" : "Connecting to the meeting..."}
            </p>
          </div>
          <div className="flex gap-2">
            {isHost && <button disabled={!ready} onClick={() => void perform(async (connection) => { await connection.end(); leaveRoom(); })} className="rounded-xl bg-red-700 px-4 py-2 text-sm font-bold">End class for everyone</button>}
            <button onClick={leaveRoom} className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-sm font-bold"><LogOut className="h-4 w-4" /> Leave</button>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-5 p-4 lg:grid-cols-[1fr_340px]">
        <section className="space-y-4">
          <div className="min-h-48 rounded-2xl border border-white/10 bg-black p-2">
            <VideoPlayerContainer class="block min-h-48 w-full"><div ref={videoMountRef} className="grid min-h-48 grid-cols-1 gap-2 sm:grid-cols-2 [&_video-player]:h-full [&_video-player]:min-h-48 [&_video-player]:w-full" /></VideoPlayerContainer>
          </div>
          <VideoPlayerContainer class="block w-full"><div ref={shareMountRef} className="w-full [&:not(:empty)]:aspect-video [&_video-player]:h-full [&_video-player]:w-full" /></VideoPlayerContainer>
          <canvas ref={shareSurfaceRef} hidden={!screenSharing || shareUsesVideo} className="max-w-full rounded-xl" aria-label="Your shared screen" />
          <video ref={shareVideoRef} hidden={!screenSharing || !shareUsesVideo} autoPlay playsInline muted className="max-w-full rounded-xl" aria-label="Your shared screen preview" />
          <div className="flex flex-wrap gap-3">
            <button disabled={!ready} onClick={() => void perform(async (connection) => { await connection.setCamera(!cameraOn); setCameraOn(!cameraOn); })} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-bold disabled:opacity-50">{cameraOn ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4" />} Camera</button>
            <button disabled={!ready} onClick={() => void perform((connection) => connection.setMicrophone(!micOn))} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-bold disabled:opacity-50">{micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />} Microphone</button>
            {isHost && <button disabled={!ready} onClick={() => void perform(async (connection) => { if (shareSurfaceRef.current && shareVideoRef.current) setShareUsesVideo(await connection.setScreenShare(!screenSharing, shareSurfaceRef.current, shareVideoRef.current)); })} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-bold"><MonitorUp className="h-4 w-4" />{screenSharing ? "Stop Share" : "Share Screen"}</button>}
          </div>
          {notice && <p role="status" className="rounded-xl bg-white/10 p-3 text-sm">{notice}</p>}
        </section>
        <aside className="space-y-4">
          {isHost && <div className="rounded-2xl border border-blue-300/20 bg-blue-400/10 p-4">
            <p className="flex items-center gap-2 font-bold text-blue-100"><ShieldCheck className="h-4 w-4" />Host controls</p>
            <button disabled={!ready} onClick={() => void perform((connection) => connection.muteAll(), "All participants have been muted.")} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-xs font-bold"><VolumeX className="h-3.5 w-3.5" />Mute all</button>
          </div>}
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
            <p className="mb-3 flex items-center gap-2 font-bold"><Users className="h-4 w-4" />Participants ({participants.length})</p>
            <div className="space-y-2">{participants.map((participant) => (
              <div key={participant.userId} className="flex items-center justify-between gap-2 rounded-xl bg-white/5 p-3">
                <div><p className="font-semibold">{participant.displayName}{participant.userId === ownZoomId ? " (You)" : ""}</p><p className="text-xs text-slate-400">{participant.isHost ? "Host" : participant.muted ? "Participant · muted" : "Participant"}</p></div>
                {isHost && participant.userId !== ownZoomId && <div className="flex gap-1">
                  <button onClick={() => void perform((connection) => connection.muteParticipant(participant.userId), `${participant.displayName} was muted.`)} className="rounded p-1.5" title="Mute participant"><MicOff className="h-3.5 w-3.5" /></button>
                  <button onClick={() => void perform((connection) => connection.removeParticipant(participant.userId), `${participant.displayName} was removed from the meeting.`)} className="rounded p-1.5 text-red-200" title="Remove participant"><X className="h-3.5 w-3.5" /></button>
                </div>}
              </div>
            ))}</div>
          </div>
        </aside>
      </div>
    </main>
  );
}
