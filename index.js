const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json({ limit: '2mb' }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
});

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'chat-memory-api' });
});

app.get('/health', async (_req, res) => {
  try {
    await pool.query('select 1');
    res.json({ ok: true, db: true });
  } catch (err) {
    res.status(500).json({
      ok: false,
      db: false,
      error: err.message,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`listening on ${PORT}`);
});

app.post('/debug/insert-chat', async (req, res) => {
  try {
    const { chat_id } = req.body;

    if (!chat_id) {
      return res.status(400).json({
        ok: false,
        error: 'chat_id es obligatorio',
      });
    }

    const result = await pool.query(
      `
      INSERT INTO chats (chat_id)
      VALUES ($1)
      ON CONFLICT (chat_id)
      DO UPDATE SET updated_at = now()
      RETURNING *
      `,
      [chat_id]
    );

    res.json({ ok: true, row: result.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/debug/chats', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM chats
      ORDER BY updated_at DESC
      LIMIT 20
    `);

    res.json({ ok: true, rows: result.rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/debug/insert-message', async (req, res) => {
  try {
    const {
      chat_id,
      role,
      content,
      sender_id = null,
      sent_by_me = false,
      message_type = 'text',
      created_at = null,
    } = req.body;

    if (!chat_id || !role || !content) {
      return res.status(400).json({
        ok: false,
        error: 'chat_id, role y content son obligatorios',
      });
    }

    const chatResult = await pool.query(
      `
      INSERT INTO chats (chat_id, updated_at)
      VALUES ($1, now())
      ON CONFLICT (chat_id)
      DO UPDATE SET updated_at = now()
      RETURNING id
      `,
      [chat_id]
    );

    const chatDbId = chatResult.rows[0].id;

    const result = await pool.query(
      `
      INSERT INTO messages (
        chat_id,
        role,
        content,
        sender_id,
        sent_by_me,
        message_type,
        created_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        COALESCE($7::timestamptz, now())
      )
      RETURNING *
      `,
      [
        chatDbId,
        role,
        content,
        sender_id,
        sent_by_me,
        message_type,
        created_at,
      ]
    );

    res.json({ ok: true, row: result.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/messages/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    const limit = Number(req.query.limit || 50);

    const result = await pool.query(
      `
      SELECT
        id,
        chat_id,
        sender_type,
        direction,
        message_type,
        created_at,
        role,
        content,
        sender_id,
        sent_by_me
      FROM messages
      WHERE chat_id = $1::bigint
      ORDER BY created_at ASC
      LIMIT $2
      `,
      [Number(chatId), limit]
    );

    res.json({
      ok: true,
      count: result.rows.length,
      rows: result.rows,
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
});

app.get('/messages-by-chat/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    const limit = Number(req.query.limit || 50);

    const result = await pool.query(
      `
      SELECT
        id,
        chat_id,
        sender_type,
        direction,
        message_type,
        created_at,
        role,
        content,
        sender_id,
        sent_by_me
      FROM messages
      WHERE chat_id = $1::bigint
      ORDER BY created_at ASC
      LIMIT $2
      `,
      [Number(chatId), limit]
    );

    res.json({
      ok: true,
      count: result.rows.length,
      rows: result.rows,
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
});

app.get('/messages-by-sender/:senderId', async (req, res) => {
  try {
    const { senderId } = req.params;
    const limit = Number(req.query.limit || 50);
    const decodedSenderId = decodeURIComponent(senderId);

    // 1) Buscar el chat interno más reciente para ese sender_id
    const latestMessageResult = await pool.query(
      `
      SELECT
        chat_id
      FROM messages
      WHERE sender_id = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [decodedSenderId]
    );

    if (!latestMessageResult.rows.length) {
      return res.json({
        ok: true,
        count: 0,
        rows: [],
      });
    }

    const internalChatId = latestMessageResult.rows[0].chat_id;

    // 2) Traer todo el historial de ese chat interno
    const result = await pool.query(
      `
      SELECT
        id,
        chat_id,
        session_id,
        sender_type,
        direction,
        text,
        message_type,
        created_at,
        role,
        content,
        sender_id,
        sent_by_me
      FROM messages
      WHERE chat_id = $1
      ORDER BY created_at ASC
      LIMIT $2
      `,
      [internalChatId, limit]
    );

    res.json({
      ok: true,
      count: result.rows.length,
      rows: result.rows,
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
});
