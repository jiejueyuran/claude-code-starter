/**
 * 飞书会话上传脚本
 * Stop hook 触发时，将当天对话 Markdown 上传到飞书云文档
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { getOrCreateSession } = require('./session-tracker.cjs');

const FEISHU_HOST = 'open.feishu.cn';
const CREDS_PATH = path.join(process.env.USERPROFILE, '.feishu-user-plugin/credentials.json');

// ── 工具函数 ────────────────────────────────────────────

function httpReq(method, urlPath, token, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: FEISHU_HOST,
      path: `/open-apis${urlPath}`,
      method,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${token}`,
      },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j.code !== 0) reject(new Error(`FS API ${j.code}: ${j.msg}`));
          else resolve(j);
        } catch (e) {
          reject(new Error(`JSON parse fail: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function getFeishuCreds() {
  const raw = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8'));
  const p = raw.profiles[raw.active] || raw.profiles.default;
  return { appId: p.LARK_APP_ID, appSecret: p.LARK_APP_SECRET };
}

async function getTenantToken(appId, appSecret) {
  const r = await httpReq('POST', '/auth/v3/tenant_access_token/internal', null, {
    app_id: appId,
    app_secret: appSecret,
  });
  return r.tenant_access_token;
}

// ── 飞书文档操作 ──────────────────────────────────────

async function createDoc(token, title) {
  const r = await httpReq('POST', '/docx/v1/documents', token, { title });
  return r.data.document.document_id;
}

async function addBlocks(token, docId, blocks) {
  for (let i = 0; i < blocks.length; i += 50) {
    await httpReq(
      'PATCH',
      `/docx/v1/documents/${docId}/blocks/${docId}/children`,
      token,
      { children: blocks.slice(i, i + 50) }
    );
    if (i + 50 < blocks.length) await sleep(200);
  }
}

async function attachToWiki(token, docId, title) {
  try {
    const spaces = await httpReq('GET', '/wiki/v2/spaces?page_size=10', token, null);
    const spaceId = spaces.data?.items?.[0]?.space_id;
    if (!spaceId) return;
    await httpReq('POST', `/wiki/v2/spaces/${spaceId}/nodes`, token, {
      obj_type: 'docx',
      parent_node_token: spaceId,
      node_type: 'origin',
      origin_node_token: docId,
      title,
    });
  } catch (_) { /* wiki 关联失败不阻塞 */ }
}

// ── Markdown → 飞书块 ─────────────────────────────────

function mdToBlocks(md) {
  // 去掉 YAML frontmatter
  let body = md.replace(/^---[\s\S]*?---\n*/, '');
  // 去掉图片引用
  body = body.replace(/!\[.*?\]\(.*?\)/g, '[图片]');
  body = body.replace(/<details>[\s\S]*?<\/details>/g, '');
  body = body.substring(0, 30000); // 截断超长内容

  const lines = body.split('\n');
  const blocks = [];
  let buf = '';

  function flush(tag) {
    const text = buf.trim().slice(0, 5000);
    if (!text) return;
    if (tag === 'h1') blocks.push({ block_type: 3, heading1: { elements: [{ text_run: { content: text } }], style: {} } });
    else if (tag === 'h2') blocks.push({ block_type: 4, heading2: { elements: [{ text_run: { content: text } }], style: {} } });
    else if (tag === 'h3') blocks.push({ block_type: 5, heading3: { elements: [{ text_run: { content: text } }], style: {} } });
    else blocks.push({ block_type: 2, text: { elements: [{ text_run: { content: text } }], style: {} } });
    buf = '';
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      flush('h' + headingMatch[1].length);
      buf = headingMatch[2];
      flush('h' + headingMatch[1].length);
      continue;
    }
    if (line.trim() === '---' || line.trim() === '') {
      flush('p');
      continue;
    }
    buf += (buf ? '\n' : '') + line;
    if (buf.length > 500) flush('p');
  }
  flush('p');

  return blocks.slice(0, 100);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── 主函数 ────────────────────────────────────────────

async function main() {
  let filePath = null;

  // 尝试从 hook stdin 读取 session_id，再查当前文件
  try {
    const input = await readStdin();
    if (input?.session_id) {
      const state = getOrCreateSession(input.session_id);
      filePath = state.currentFile;
    }
  } catch (_) {}

  if (!filePath || !fs.existsSync(filePath)) {
    process.exit(0);
  }

  const { appId, appSecret } = getFeishuCreds();
  const token = await getTenantToken(appId, appSecret);

  // ── 上传主对话文件 ──
  const md = fs.readFileSync(filePath, 'utf8');
  if (md.trim()) {
    const baseName = path.basename(filePath, '.md');
    const title = `[Claude] ${baseName}`;
    const docId = await createDoc(token, title);

    const blocks = mdToBlocks(md);
    if (blocks.length > 0) await addBlocks(token, docId, blocks);
    await attachToWiki(token, docId, title);
    console.log(`✅ 对话: https://bytedance.feishu.cn/docx/${docId}`);
  }

  // ── 上传 ReMeLight 摘要文件 ──
  const memoryDir = process.env.CLAUDE_MEMORY_DIR;
  if (!memoryDir) return;
  try {
    const summaryFiles = fs.readdirSync(memoryDir)
      .filter(f => f.startsWith('session_summary_') && f.endsWith('.md'))
      .sort()
      .reverse();

    for (const sf of summaryFiles) {
      const sfPath = path.join(memoryDir, sf);
      const sfMd = fs.readFileSync(sfPath, 'utf8');
      if (!sfMd.trim()) continue;

      const sfTitle = `[摘要] ${sf.replace('session_summary_', '').replace('.md', '')}`;
      const sfDocId = await createDoc(token, sfTitle);
      const sfBlocks = mdToBlocks(sfMd);
      if (sfBlocks.length > 0) await addBlocks(token, sfDocId, sfBlocks);
      await attachToWiki(token, sfDocId, sfTitle);
      console.log(`✅ 摘要: https://bytedance.feishu.cn/docx/${sfDocId}`);
      break; // 只上传最新的一个摘要
    }
  } catch (_) { /* 摘要目录不存在时跳过 */ }

  process.exit(0);
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => {
      try { resolve(JSON.parse(data)); } catch (_) { resolve(null); }
    });
    process.stdin.on('error', () => resolve(null));
    setTimeout(() => resolve(null), 1000);
  });
}

main().catch((e) => {
  console.error('❌ 飞书上传失败:', e.message);
  process.exit(1);
});
