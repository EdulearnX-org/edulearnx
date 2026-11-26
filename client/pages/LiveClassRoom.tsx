import { getCurrentPortalUser, type PortalUser } from "@/lib/portalData";
import { Crown, LogOut, MessageCircle, Mic, MicOff, MonitorUp, Settings2, ShieldCheck, UserRound, Users, Volume2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";

type PeerInfo = { id: string; name: string; role: "teacher" | "student" };
type ChatMessage = { id: string; userId: string; name: string; text: string; sentAt: string };
type RoomState = { type: "room-state"; self: PeerInfo; participants: PeerInfo[] };

type ConnectionOptions = {
  classId: string;
  user: Pick<PortalUser, "id" | "name" | "role">;
  onRoom: (participants: PeerInfo[]) => void;
  onChat: (message: ChatMessage) => void;
  onRemoteAudio: (userId: string, stream: MediaStream | null) => void;
  onRemoteScreen: (userId: string, stream: MediaStream | null) => void;
  onNotice: (message: string) => void;
  onClosed: (message: string) => void;
};

export function createClassroomConnection(options: ConnectionOptions) {
  let attendanceId: string | number | null = null;
  let stopped = false;
  let socket: WebSocket | null = null;
  let reconnectTimer: number | undefined;
  let reconnectAttempts = 0;
  let localAudio: MediaStream | null = null;
  let displayStream: MediaStream | null = null;
  const peers = new Map<string, RTCPeerConnection>();
  const participants = new Map<string, PeerInfo>();
  const pendingIce = new Map<string, RTCIceCandidateInit[]>();

  async function api(action: string, body?: unknown) {
    const response = await fetch(`/api/live-classes/${options.classId}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to connect to this class.");
    return payload.data;
  }

  function send(message: Record<string, unknown>) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  function publishParticipants() {
    options.onRoom([...participants.values()]);
  }

  async function negotiate(peerId: string, pc: RTCPeerConnection) {
    if (stopped || pc.signalingState !== "stable") return;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send({ type: "offer", targetId: peerId, description: pc.localDescription });
    } catch (error) {
      options.onNotice(error instanceof Error ? error.message : "Could not establish the audio connection.");
    }
  }

  function createPeer(peer: PeerInfo) {
    if (peers.has(peer.id) || stopped) return peers.get(peer.id);
    participants.set(peer.id, peer);
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    // Audio is bidirectional; only the teacher is allowed to send a screen track.
    const audio = pc.addTransceiver("audio", { direction: "sendrecv" });
    if (options.user.role === "teacher") pc.addTransceiver("video", { direction: "sendrecv" });
    else pc.addTransceiver("video", { direction: "recvonly" });
    if (localAudio?.getAudioTracks()[0]) void audio.sender.replaceTrack(localAudio.getAudioTracks()[0]);
    if (displayStream?.getVideoTracks()[0] && options.user.role === "teacher") {
      const video = pc.getTransceivers().find((item) => item.receiver.track.kind === "video");
      if (video) void video.sender.replaceTrack(displayStream.getVideoTracks()[0]);
    }
    pc.onicecandidate = (event) => {
      if (event.candidate) send({ type: "ice-candidate", targetId: peer.id, candidate: event.candidate.toJSON() });
    };
    pc.ontrack = (event) => {
      if (event.track.kind === "audio") options.onRemoteAudio(peer.id, event.streams[0] ?? new MediaStream([event.track]));
      if (event.track.kind === "video") {
        const screen = event.streams[0] ?? new MediaStream([event.track]);
        options.onRemoteScreen(peer.id, screen);
        event.track.addEventListener("ended", () => options.onRemoteScreen(peer.id, null), { once: true });
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") options.onNotice(`Audio connection to ${peer.name} failed. Try reconnecting.`);
    };
    peers.set(peer.id, pc);
    publishParticipants();
    // Stable deterministic offerer prevents both ends creating an offer at once.
    if (String(options.user.id).localeCompare(peer.id, undefined, { numeric: true }) < 0) void negotiate(peer.id, pc);
    return pc;
  }

  async function handleSignal(message: any) {
    if (!message || typeof message.type !== "string") return;
    if (message.type === "room-state") {
      const state = message as RoomState;
      for (const peer of state.participants ?? []) createPeer(peer);
      publishParticipants();
      return;
    }
    if (message.type === "participant-joined" && message.participant) {
      createPeer(message.participant as PeerInfo);
      return;
    }
    if (message.type === "participant-left") {
      const peerId = String(message.userId);
      peers.get(peerId)?.close();
      peers.delete(peerId);
      participants.delete(peerId);
      options.onRemoteAudio(peerId, null);
      publishParticipants();
      return;
    }
    if (message.type === "chat") {
      options.onChat(message as ChatMessage);
      return;
    }
    if (message.type === "mute-request" && String(message.targetId ?? options.user.id) === String(options.user.id)) {
      localAudio?.getAudioTracks().forEach((track) => { track.enabled = false; });
      options.onNotice("The teacher muted your microphone.");
      return;
    }
    if (message.type === "class-ended") {
      options.onClosed("The teacher has ended this class.");
      return;
    }
    if (message.type === "screen-share-state") {
      options.onNotice(message.enabled ? "The teacher started sharing their screen." : "Screen sharing ended.");
      return;
    }
    if (message.type === "offer" || message.type === "answer" || message.type === "ice-candidate") {
      const peerId = String(message.userId);
      const peer = participants.get(peerId) ?? { id: peerId, name: message.name || "Participant", role: "student" as const };
      const pc = createPeer(peer);
      if (!pc) return;
      try {
        if (message.type === "offer" && message.description) {
          if (pc.signalingState !== "stable") await pc.setLocalDescription({ type: "rollback" });
          await pc.setRemoteDescription(message.description);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send({ type: "answer", targetId: peerId, description: pc.localDescription });
          for (const candidate of pendingIce.get(peerId) ?? []) await pc.addIceCandidate(candidate);
          pendingIce.delete(peerId);
        } else if (message.type === "answer" && message.description) {
          await pc.setRemoteDescription(message.description);
          for (const candidate of pendingIce.get(peerId) ?? []) await pc.addIceCandidate(candidate);
          pendingIce.delete(peerId);
        } else if (message.type === "ice-candidate" && message.candidate) {
          if (pc.remoteDescription) await pc.addIceCandidate(message.candidate);
          else pendingIce.set(peerId, [...(pendingIce.get(peerId) ?? []), message.candidate]);
        }
      } catch (error) {
        options.onNotice(error instanceof Error ? error.message : "A classroom connection could not be negotiated.");
      }
    }
  }

  async function connectSocket(initial = false): Promise<void> {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const nextSocket = new WebSocket(`${protocol}//${window.location.host}/realtime/live-classes/${options.classId}`);
    socket = nextSocket;
    nextSocket.addEventListener("message", (event) => {
      try { void handleSignal(JSON.parse(String(event.data))); } catch { /* Ignore malformed server events. */ }
    });
    nextSocket.addEventListener("close", (event) => {
      if (stopped) return;
      if (event.code === 4003) { options.onClosed("The teacher removed you from this class."); return; }
      if (event.code === 4002) { options.onClosed("The teacher has ended this class."); return; }
      options.onNotice("Classroom connection interrupted. Reconnecting…");
      reconnectAttempts += 1;
      const delay = Math.min(15000, 1000 * (2 ** Math.min(reconnectAttempts, 4)));
      reconnectTimer = window.setTimeout(() => { void connectSocket(false).catch(() => undefined); }, delay);
    });
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("The classroom server did not respond in time.")), 12000);
      nextSocket.addEventListener("open", () => {
        window.clearTimeout(timeout);
        reconnectAttempts = 0;
        resolve();
      }, { once: true });
      nextSocket.addEventListener("error", () => {
        window.clearTimeout(timeout);
        if (initial) reject(new Error("Could not connect to the classroom server."));
      }, { once: true });
    });
  }

  async function start() {
    try {
      if (options.user.role === "teacher") await api("start");
      const joined = await api("join");
      attendanceId = joined.attendance?.id ?? null;
      await connectSocket(true);
      return joined;
    } catch (error) {
      await stop();
      throw error;
    }
  }

  async function setMicrophone(enabled: boolean) {
    if (enabled) {
      if (!localAudio) localAudio = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      localAudio.getAudioTracks().forEach((track) => { track.enabled = true; });
      for (const [peerId, pc] of peers) {
        const sender = pc.getTransceivers().find((item) => item.receiver.track.kind === "audio")?.sender;
        if (sender) await sender.replaceTrack(localAudio.getAudioTracks()[0]);
      }
    } else {
      localAudio?.getAudioTracks().forEach((track) => { track.enabled = false; });
    }
    send({ type: "microphone-state", enabled });
  }

  async function setScreenShare(enabled: boolean) {
    if (options.user.role !== "teacher") throw new Error("Only the teacher can share a screen.");
    if (enabled) {
      displayStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 10 }, audio: false });
      const track = displayStream.getVideoTracks()[0];
      track.addEventListener("ended", () => { void setScreenShare(false); }, { once: true });
      for (const [peerId, pc] of peers) {
        const sender = pc.getTransceivers().find((item) => item.receiver.track.kind === "video")?.sender;
        if (sender) await sender.replaceTrack(track);
        if (pc.signalingState === "stable") void negotiate(peerId, pc);
      }
    } else {
      displayStream?.getTracks().forEach((track) => track.stop());
      displayStream = null;
      for (const [peerId, pc] of peers) {
        const sender = pc.getTransceivers().find((item) => item.receiver.track.kind === "video")?.sender;
        if (sender) await sender.replaceTrack(null);
      }
    }
    send({ type: "screen-share-state", enabled });
  }

  function sendChat(text: string) { send({ type: "chat", text }); }
  function muteParticipant(userId: string) { send({ type: "mute-request", targetId: userId }); }
  function removeParticipant(userId: string) { send({ type: "remove-request", targetId: userId }); }

  async function endClass() { await api("end"); send({ type: "class-ended" }); await stop(); }
  async function stop() {
    if (stopped) return;
    stopped = true;
    if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
    socket?.close(1000, "Leaving class");
    peers.forEach((pc) => pc.close());
    peers.clear();
    localAudio?.getTracks().forEach((track) => track.stop());
    displayStream?.getTracks().forEach((track) => track.stop());
    if (attendanceId !== null) {
      try { await api("leave", { attendance_id: attendanceId }); } catch { /* Attendance is also closed when the class ends. */ }
    }
  }

  return { start, setMicrophone, setScreenShare, sendChat, muteParticipant, removeParticipant, endClass, stop };
}

type ClassroomConnection = ReturnType<typeof createClassroomConnection>;

export default function LiveClassRoom() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const user = getCurrentPortalUser();
  const connectionRef = useRef<ClassroomConnection | null>(null);
  const audioRefs = useRef(new Map<string, HTMLAudioElement>());
  const remoteStreams = useRef(new Map<string, MediaStream>());
  const screenRefs = useRef(new Map<string, HTMLVideoElement>());
  const [remoteScreens, setRemoteScreens] = useState<Record<string, MediaStream>>({});
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const [title, setTitle] = useState("Connecting to class…");
  const [course, setCourse] = useState("");
  const [participants, setParticipants] = useState<PeerInfo[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const [micOn, setMicOn] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [ready, setReady] = useState(false);
  const [panel, setPanel] = useState<"participants" | "chat">("participants");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const isTeacher = user?.role === "teacher";
  const ownId = String(user?.id ?? "");
  const leavePath = useMemo(() => user?.role === "student" ? "/student/live-classes" : "/teacher", [user?.role]);

  useEffect(() => {
    if (!id || !user || !["teacher", "student"].includes(user.role)) {
      navigate("/signin", { replace: true });
      return;
    }
    let cancelled = false;
    const connection = createClassroomConnection({
      classId: id,
      user: { id: user.id, name: user.name, role: user.role as "teacher" | "student" },
      onRoom: setParticipants,
      onChat: (message) => setMessages((current) => [...current, message].slice(-100)),
      onRemoteAudio: (peerId, stream) => {
        if (stream) remoteStreams.current.set(peerId, stream);
        else remoteStreams.current.delete(peerId);
        const element = audioRefs.current.get(peerId);
        if (element) {
          element.srcObject = stream;
          if (stream) void element.play().catch(() => setNotice("Tap the microphone control once to enable audio playback."));
        }
      },
      onRemoteScreen: (peerId, stream) => {
        setRemoteScreens((current) => {
          const next = { ...current };
          if (stream) next[peerId] = stream; else delete next[peerId];
          return next;
        });
        const video = screenRefs.current.get(peerId);
        if (video) { video.srcObject = stream; if (stream) void video.play().catch(() => undefined); }
      },
      onNotice: setNotice,
      onClosed: (message) => { if (!cancelled) setError(message); },
    });
    connectionRef.current = connection;
    void connection.start().then((joined) => {
      if (cancelled) return;
      setTitle(joined.live_class?.title || "Live class");
      setCourse(joined.live_class?.course_title || "");
      setStartedAt(joined.live_class?.started_at ? new Date(joined.live_class.started_at).getTime() : Date.now());
      setReady(true);
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to join this class.");
    });
    return () => {
      cancelled = true;
      connectionRef.current = null;
      void connection.stop();
    };
  }, [id, user?.id, user?.name, user?.role, navigate]);

  useEffect(() => {
    if (!startedAt) return;
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const formatTime = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const leave = useCallback(async () => {
    await connectionRef.current?.stop();
    navigate(leavePath, { replace: true });
  }, [leavePath, navigate]);
  const endClass = useCallback(async () => {
    try {
      await connectionRef.current?.endClass();
      navigate(leavePath, { replace: true });
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Unable to end the class."); }
  }, [leavePath, navigate]);
  const runAction = async (action: () => Promise<void>) => {
    try { await action(); } catch (reason) { setNotice(reason instanceof Error ? reason.message : "The action could not be completed."); }
  };
  const submitChat = (event: FormEvent) => {
    event.preventDefault();
    const value = chatText.trim();
    if (!value) return;
    connectionRef.current?.sendChat(value);
    setChatText("");
  };

  if (error) return (
    <main className="flex min-h-screen items-center justify-center bg-[#080d1b] p-6 text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.06] p-8 text-center shadow-2xl">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/15 text-red-300"><X className="h-7 w-7" /></div>
        <h1 className="text-xl font-bold">Unable to join the classroom</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">{error}</p>
        <button onClick={() => navigate(leavePath, { replace: true })} className="mt-6 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-900">Back to my classes</button>
      </div>
    </main>
  );

  return (
    <main className="min-h-screen bg-[#080d1b] text-white">
      <header className="border-b border-white/10 bg-[#0d1426]/95 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <img src="/logo.png" alt="EduLearnX" className="h-10 w-10 rounded-xl object-contain" />
            <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">EduLearnX Classroom</p><h1 className="truncate text-base font-bold sm:text-lg">{title}</h1><p className="truncate text-xs text-slate-400">{course}</p></div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300 sm:flex"><span className="h-2 w-2 rounded-full bg-emerald-400" />{ready ? "Connected" : "Connecting"}</div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-right"><p className="text-[10px] uppercase tracking-wider text-slate-400">Class time</p><p className="font-mono text-sm font-semibold">{formatTime(elapsed)} <span className="text-[10px] font-normal text-slate-500">/ 40:00</span></p></div>
            {isTeacher && <div className="relative">
              <button onClick={() => setSettingsOpen((open) => !open)} aria-label="Class settings" className="rounded-xl border border-white/10 bg-white/[0.05] p-2.5 hover:bg-white/10"><Settings2 className="h-5 w-5" /></button>
              {settingsOpen && <div className="absolute right-0 top-12 z-20 w-64 rounded-2xl border border-white/10 bg-[#151f35] p-3 shadow-2xl">
                <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Teacher settings</p>
                <button onClick={() => { void runAction(async () => { await connectionRef.current?.setMicrophone(!micOn); setMicOn(!micOn); }); setSettingsOpen(false); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-white/10">{micOn ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />} {micOn ? "Mute my microphone" : "Turn on microphone"}</button>
                <button onClick={() => { void runAction(async () => { await connectionRef.current?.setScreenShare(!sharing); setSharing(!sharing); }); setSettingsOpen(false); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-white/10"><MonitorUp className="h-4 w-4" />{sharing ? "Stop screen sharing" : "Share my screen"}</button>
                <p className="px-3 pt-2 text-[11px] leading-5 text-slate-500">Audio-only classroom. Camera is disabled for everyone.</p>
              </div>}
            </div>}
            <button onClick={() => void leave()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-xs font-semibold text-slate-300 hover:bg-white/10"><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Leave</span></button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-h-[72vh] flex-col overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#111c34] via-[#0d1528] to-[#101b32] shadow-2xl">
          {Object.entries(remoteScreens).length > 0 && <div className="border-b border-white/10 bg-black/30 p-3">{Object.entries(remoteScreens).map(([peerId, stream]) => <video key={peerId} autoPlay playsInline className="max-h-[55vh] w-full rounded-2xl bg-black object-contain" ref={(node) => { if (node) { screenRefs.current.set(peerId, node); node.srcObject = stream; void node.play().catch(() => undefined); } else screenRefs.current.delete(peerId); }} />)}</div>}
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <div className="relative flex h-32 w-32 items-center justify-center rounded-full border border-blue-300/20 bg-gradient-to-br from-blue-400/20 to-indigo-500/10 shadow-[0_0_70px_rgba(59,130,246,0.12)]">
              <UserRound className="h-14 w-14 text-blue-100" />
              <span className="absolute bottom-1 right-1 flex h-8 w-8 items-center justify-center rounded-full border-4 border-[#111c34] bg-emerald-400 text-[#071326]"><Volume2 className="h-4 w-4" /></span>
            </div>
            <p className="mt-6 text-xl font-bold">{user?.name || "Participant"}</p>
            <p className="mt-1 text-sm text-slate-400">{isTeacher ? "Your classroom is live" : "You are in the classroom"}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <button disabled={!ready} onClick={() => void runAction(async () => { await connectionRef.current?.setMicrophone(!micOn); setMicOn(!micOn); })} className={`inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition ${micOn ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20" : "border border-white/10 bg-white/10 text-white hover:bg-white/15"}`}>{micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}{micOn ? "Microphone on" : "Turn on microphone"}</button>
              {isTeacher && <button disabled={!ready} onClick={() => void runAction(async () => { await connectionRef.current?.setScreenShare(!sharing); setSharing(!sharing); })} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-sm font-semibold hover:bg-white/15"><MonitorUp className="h-4 w-4" />{sharing ? "Stop sharing" : "Share screen"}</button>}
            </div>
            <p className="mt-5 max-w-md text-xs leading-5 text-slate-500">Your microphone starts muted. No camera is used in this classroom. The teacher controls when the class ends.</p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-black/10 px-5 py-4">
            <div className="flex items-center gap-2 text-xs text-slate-400"><ShieldCheck className="h-4 w-4 text-emerald-300" />Private classroom · up to 2 students</div>
            {isTeacher && <button onClick={() => void endClass()} className="rounded-xl bg-red-500 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-red-500/20 hover:bg-red-400">End class for everyone</button>}
          </div>
        </section>

        <aside className="flex min-h-[72vh] flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#10192c] shadow-xl">
          <div className="grid grid-cols-2 border-b border-white/10 p-2">
            <button onClick={() => setPanel("participants")} className={`flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold ${panel === "participants" ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`}><Users className="h-4 w-4" />People <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] text-blue-200">{participants.length + 1}</span></button>
            <button onClick={() => setPanel("chat")} className={`flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold ${panel === "chat" ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`}><MessageCircle className="h-4 w-4" />Chat <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px]">{messages.length}</span></button>
          </div>
          {panel === "participants" ? <div className="flex-1 space-y-2 overflow-y-auto p-4">
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/20"><Crown className="h-4 w-4 text-blue-200" /></div><div><p className="text-sm font-semibold">{user?.name} (You)</p><p className="text-xs text-slate-500">{isTeacher ? "Teacher / Host" : "Student"}</p></div></div><span className="h-2 w-2 rounded-full bg-emerald-400" />
            </div>
            {participants.map((person) => <div key={person.id} className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20"><UserRound className="h-4 w-4 text-indigo-200" /></div><div className="min-w-0"><p className="truncate text-sm font-semibold">{person.name}</p><p className="text-xs text-slate-500">{person.role === "teacher" ? "Teacher" : "Student"}</p></div></div>
              {isTeacher && person.role === "student" && <div className="flex shrink-0 gap-1"><button title="Mute student" onClick={() => connectionRef.current?.muteParticipant(person.id)} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"><MicOff className="h-4 w-4" /></button><button title="Remove student" onClick={() => connectionRef.current?.removeParticipant(person.id)} className="rounded-lg p-2 text-red-300 hover:bg-red-500/10"><X className="h-4 w-4" /></button></div>}
            </div>)}
            {participants.length === 0 && <div className="py-10 text-center"><Users className="mx-auto h-8 w-8 text-slate-600" /><p className="mt-3 text-sm text-slate-400">Waiting for students to join</p></div>}
          </div> : <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.map((message) => <div key={message.id} className={`max-w-[92%] rounded-2xl p-3 ${message.userId === ownId ? "ml-auto bg-blue-500/20" : "bg-white/[0.06]"}`}><p className="text-[11px] font-semibold text-blue-200">{message.userId === ownId ? "You" : message.name}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-100">{message.text}</p><p className="mt-1 text-right text-[10px] text-slate-500">{new Date(message.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p></div>)}
              {messages.length === 0 && <div className="py-10 text-center"><MessageCircle className="mx-auto h-8 w-8 text-slate-600" /><p className="mt-3 text-sm text-slate-400">Messages will appear here</p></div>}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={submitChat} className="flex gap-2 border-t border-white/10 p-3"><input value={chatText} onChange={(event) => setChatText(event.target.value)} maxLength={2000} placeholder="Write a message…" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-400/50" /><button disabled={!chatText.trim()} className="rounded-xl bg-blue-500 px-4 text-sm font-bold text-white disabled:opacity-40">Send</button></form>
          </div>}
        </aside>
      </div>

      {notice && <div role="status" className="fixed bottom-5 left-1/2 z-30 flex max-w-[90vw] -translate-x-1/2 items-center gap-3 rounded-2xl border border-white/10 bg-[#1a2740] px-4 py-3 text-sm text-slate-100 shadow-2xl"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss" className="text-slate-400 hover:text-white"><X className="h-4 w-4" /></button></div>}
      {participants.map((person) => <audio key={person.id} autoPlay playsInline ref={(node) => { if (node) { audioRefs.current.set(person.id, node); const stream = remoteStreams.current.get(person.id); if (stream) { node.srcObject = stream; void node.play().catch(() => setNotice("Tap the microphone control once to enable audio playback.")); } } else audioRefs.current.delete(person.id); }} />)}
    </main>
  );
}
