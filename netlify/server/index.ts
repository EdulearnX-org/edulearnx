import { createServer as createHttpServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createExpressApp, initializeServer } from "../../server/index.js";
import { query } from "../../server/db/connection.js";

type SocketUser = { id: string; role: "teacher" | "student"; name: string };
type RoomClient = { socket: WebSocket; user: SocketUser; classId: string };

const roomClients = new Map<string, Set<RoomClient>>();
const indexHtml = fileURLToPath(new URL("../../dist/spa/index.html", import.meta.url));
const app = createExpressApp();

// Netlify serves built static assets before this server. The server supplies the
// SPA document for client-side routes that are not physical files.
app.get("/{*path}", async (_req, res) => {
  try {
    res.type("html").send(await readFile(indexHtml));
  } catch {
    res.status(503).send("EduLearnX is being deployed. Please try again shortly.");
  }
});

await initializeServer();

const server = createHttpServer(app);
const sockets = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

function readCookie(cookieHeader: string | undefined, name: string) {
  const item = cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(name + "="));
  if (!item) return undefined;
  try { return decodeURIComponent(item.slice(name.length + 1)); } catch { return undefined; }
}

async function authorizeSocket(request: import("node:http").IncomingMessage, classId: string): Promise<SocketUser | null> {
  const token = readCookie(request.headers.cookie, "auth_token");
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;

  const session = await query(
    `SELECT u.id::text AS id, u.role, u.full_name
     FROM auth_sessions s
     JOIN users u ON u.id::text = s.user_id
     WHERE s.token_hash = $1
       AND s.expires_at > CURRENT_TIMESTAMP
       AND u.is_active IS DISTINCT FROM FALSE`,
    [createHash("sha256").update(token).digest("hex")],
  );
  const user = session.rows[0];
  if (!user || !["teacher", "student"].includes(user.role)) return null;

  const liveClass = await query(
    `SELECT lc.teacher_id::text AS teacher_id, lc.status, lc.scheduled_end,
            EXISTS(SELECT 1 FROM enrollments e WHERE e.student_id = $2 AND e.course_id = lc.course_id) AS enrolled,
            EXISTS(SELECT 1 FROM live_class_attendance a
                   WHERE a.live_class_id = lc.id AND a.user_id = $2 AND a.left_at IS NULL) AS attending
     FROM live_classes lc WHERE lc.id = $1`,
    [classId, user.id],
  );
  const room = liveClass.rows[0];
  if (!room || room.status !== "active" || new Date(room.scheduled_end).getTime() < Date.now() || !room.attending) return null;
  if (user.role === "teacher" && room.teacher_id !== String(user.id)) return null;
  if (user.role === "student" && !room.enrolled) return null;
  return { id: String(user.id), role: user.role, name: String(user.full_name || "EduLearnX participant") };
}

function send(client: RoomClient, payload: unknown) {
  if (client.socket.readyState === WebSocket.OPEN) client.socket.send(JSON.stringify(payload));
}

function removeClient(client: RoomClient) {
  const room = roomClients.get(client.classId);
  if (!room) return;
  room.delete(client);
  for (const peer of room) send(peer, { type: "participant-left", userId: client.user.id });
  if (room.size === 0) roomClients.delete(client.classId);
}

server.on("upgrade", (request, socket, head) => {
  void (async () => {
    const url = new URL(request.url || "/", "http://localhost");
    const match = url.pathname.match(/^\/realtime\/live-classes\/([0-9]+)$/);
    if (!match) { socket.destroy(); return; }

    let user: SocketUser | null = null;
    try { user = await authorizeSocket(request, match[1]); } catch (error) {
      console.error("Classroom WebSocket authorization failed:", error);
    }
    if (!user) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    const classId = match[1];
    const room = roomClients.get(classId) ?? new Set<RoomClient>();
    const existing = [...room].find((client) => client.user.id === user!.id);
    const teacherAlreadyConnected = [...room].some((client) => client.user.role === "teacher" && user!.role === "teacher" && client.user.id !== user!.id);
    const studentCount = [...room].filter((client) => client.user.role === "student" && client.user.id !== user!.id).length;
    if (!existing && (room.size >= 3 || teacherAlreadyConnected || (user.role === "student" && studentCount >= 2))) {
      socket.write("HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    if (existing) {
      existing.socket.close(4001, "This account joined from another tab");
      removeClient(existing);
    }

    sockets.handleUpgrade(request, socket, head, (webSocket) => {
      const client: RoomClient = { socket: webSocket, user: user!, classId };
      room.add(client);
      roomClients.set(classId, room);
      send(client, {
        type: "room-state",
        self: { id: user!.id, name: user!.name, role: user!.role },
        participants: [...room].filter((peer) => peer !== client).map((peer) => ({
          id: peer.user.id, name: peer.user.name, role: peer.user.role,
        })),
      });
      for (const peer of room) {
        if (peer !== client) send(peer, { type: "participant-joined", participant: {
          id: user!.id, name: user!.name, role: user!.role,
        } });
      }

      webSocket.on("message", (raw) => {
        let message: any;
        try { message = JSON.parse(raw.toString()); } catch { return; }
        if (!message || typeof message.type !== "string") return;
        const allowed = new Set(["offer", "answer", "ice-candidate", "chat", "microphone-state", "screen-share-state", "mute-request", "remove-request"]);
        if (!allowed.has(message.type)) return;
        if (["mute-request", "remove-request"].includes(message.type) && user!.role !== "teacher") return;
        if (message.type === "chat") {
          const text = typeof message.text === "string" ? message.text.trim().slice(0, 2000) : "";
          if (!text) return;
          const event = { type: "chat", id: randomUUID(), userId: user!.id, name: user!.name, text, sentAt: new Date().toISOString() };
          for (const peer of room) send(peer, event);
          return;
        }
        const targetId = typeof message.targetId === "string" ? message.targetId : "";
        const target = targetId ? [...room].find((peer) => peer.user.id === targetId) : undefined;
        if (message.type === "remove-request" && target?.user.role === "student") {
          target.socket.close(4003, "Removed by the teacher");
          return;
        }
        const event = { ...message, userId: user!.id, name: user!.name };
        delete event.targetId;
        if (target) send(target, event);
        else for (const peer of room) if (peer !== client) send(peer, event);
      });
      webSocket.on("close", () => removeClient(client));
      webSocket.on("error", () => removeClient(client));
    });
  })();
});

const port = Number(process.env.PORT || 8888);
server.listen(port);

process.once("SIGTERM", () => {
  for (const room of roomClients.values()) for (const client of room) client.socket.close(1012, "Server restarting");
  server.close();
});

export default server;
