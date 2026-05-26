const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const config = require('../../config.cjs');

/**
 * 获取历史目录路径
 */
function getHistoryDir() {
  return config.getHistoryDir();
}

/**
 * 确保目录存在
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 获取当前日期目录 (YYYY-MM)
 */
function getDateDir() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * 获取日期文件夹路径 (YYYY-MM-DD)
 * @returns {string} - 日期文件夹路径，如 "chat_history/2026-01-27"
 */
function getDateFolder() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 生成文件名 (YYYY-MM-DD_序号.md)
 */
function generateFileName(dateStr, index) {
  return `${dateStr}_${String(index).padStart(3, '0')}.md`;
}

/**
 * 获取今天的序号
 */
function getTodayIndex(dateStr) {
  const historyDir = getHistoryDir();
  const dateDir = path.join(historyDir, getDateDir());

  if (!fs.existsSync(dateDir)) {
    return 1;
  }

  const files = fs.readdirSync(dateDir)
    .filter(f => f.startsWith(dateStr) && f.endsWith('.md'));

  return files.length + 1;
}

/**
 * 读取 JSON 输入
 */
function readInput() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    process.stdin.on('error', reject);
  });
}

/**
 * 格式化时间戳
 */
function formatTimestamp(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

/**
 * 转义 Markdown 特殊字符
 */
function escapeMarkdown(text) {
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 提取代码块
 */
function extractCodeBlocks(text) {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  const codeBlocks = [];
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    codeBlocks.push({
      language: match[1] || 'text',
      code: match[2].trim()
    });
  }

  return codeBlocks;
}

/**
 * 获取图片目录路径
 */
function getImagesDir() {
  const dateDir = path.join(getHistoryDir(), getDateDir());
  return path.join(dateDir, 'images');
}

/**
 * 生成图片文件名
 */
function generateImageFileName(mdFileName, imageIndex) {
  const baseName = mdFileName.replace('.md', '');
  return `${baseName}_img${imageIndex}.png`;
}

/**
 * 下载图片到本地
 */
function downloadImage(imageUrl, filePath) {
  return new Promise((resolve, reject) => {
    const protocol = imageUrl.startsWith('https') ? https : http;
    const url = new URL(imageUrl);

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      // 忽略自签名证书错误（某些内部环境）
      rejectUnauthorized: false
    };

    const req = protocol.request(options, (res) => {
      // 处理重定向
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirectUrl = res.headers.location;
        if (redirectUrl) {
          return downloadImage(redirectUrl, filePath).then(resolve).catch(reject);
        }
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`下载图片失败: ${res.statusCode}`));
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        fs.writeFileSync(filePath, buffer);
        resolve(filePath);
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('下载图片超时'));
    });

    req.end();
  });
}

/**
 * 保存 base64 图片到本地
 */
function saveBase64Image(base64Data, filePath) {
  return new Promise((resolve, reject) => {
    try {
      // base64 数据可能包含 data:image/png;base64, 前缀
      const base64String = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
      const buffer = Buffer.from(base64String, 'base64');
      fs.writeFileSync(filePath, buffer);
      resolve(filePath);
    } catch (e) {
      reject(new Error(`保存 base64 图片失败: ${e.message}`));
    }
  });
}

/**
 * 从 transcript 中提取图片 URL
 */
function extractImages(transcriptPath) {
  const images = [];

  if (!fs.existsSync(transcriptPath)) {
    return images;
  }

  try {
    const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(line => line.trim());

    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        // 提取用户消息中的图片（注意：type 是 'user' 不是 'human'）
        if (data.type === 'user' && data.message?.role === 'user') {
          if (Array.isArray(data.message.content)) {
            for (const item of data.message.content) {
              if (item.type === 'image') {
                // 支持 URL 格式
                if (item.source?.type === 'url' && item.source.url) {
                  images.push({
                    type: 'url',
                    url: item.source.url,
                    timestamp: new Date().toISOString()
                  });
                }
                // 支持 base64 格式
                else if (item.source?.type === 'base64' && item.source.data) {
                  images.push({
                    type: 'base64',
                    data: item.source.data,
                    mediaType: item.source.media_type || 'image/png',
                    timestamp: new Date().toISOString()
                  });
                }
              }
            }
          }
        }
      } catch (e) {
        // 忽略解析错误
      }
    }
  } catch (e) {
    console.error('提取图片失败:', e.message);
  }

  return images;
}

/**
 * 从文本中提取文件路径
 * 支持相对路径、绝对路径、以及常见的代码引用格式
 */
function extractFilePaths(text) {
  if (!text || typeof text !== 'string') return [];

  const paths = [];

  // 匹配各种文件路径模式
  const patterns = [
    // Windows 绝对路径: D:\work\ai_db_manage\src\...
    /[A-Z]:\\[^"\s\]]+/gi,
    // Unix 绝对路径: /home/user/project/...
    /\/[^"\s\]]+/gi,
    // 相对路径: src/components/..., ./src/..., ../src/...
    /(?:^|[\s\(])((?:\.\.?\/|src\/|frontend\/|backend\/)[^"\s\]]+)/gi,
    // 代码引用: "file: xxx.java", "在 file.vue 中"
    /(?:文件|file|路径)[:：]\s*([^\s,，。]+(?:\.[a-z]{2,4})?)/gi,
  ];

  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        // 清理路径
        let cleanPath = match.trim();
        // 移除可能的引号和括号
        cleanPath = cleanPath.replace(/^[\('"]|[\)'"]$/g, '');
        // 移除行号标记（如 :123:10）
        cleanPath = cleanPath.replace(/:\d+(:\d+)?$/, '');
        // 移除末尾的标点
        cleanPath = cleanPath.replace(/[。,，;：:]$/, '');

        if (cleanPath.length > 3 && !paths.includes(cleanPath)) {
          paths.push(cleanPath);
        }
      }
    }
  }

  return paths;
}

/**
 * 从用户问题内容中提取中文主题
 * 例如: "帮我优化登录页面" -> "登录页面优化"
 */
function getTopicFromPrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') return null;

  // 常见的中文主题关键词模式
  const topicPatterns = [
    // 功能开发
    /(?:添加|增加|新增|实现|开发|创建)(?:一个)?(.{2,10})(?:功能|模块|页面|组件|接口)/,
    /(.{2,10})(?:功能|模块|页面|组件|接口)(?:开发|实现|编写)/,
    // Bug修复
    /(?:修复|解决)(?:一个)?(.{2,15})(?:问题|错误|bug|Bug)/,
    /(.{2,15})(?:报错|错误|问题|有bug)/,
    // 优化改进
    /(?:优化|改进|改善|提升)(?:一下)?(.{2,15})/,
    /(.{2,15})(?:优化|改进|改善|升级)/,
    // 数据操作
    /(?:导出|导入|删除|添加|修改|更新)(?:数据)?(?:到|的)?(.{2,10})/,
    /(.{2,10})(?:表格|数据|列表)/,
    // 查询搜索
    /(?:查询|查找|搜索|检索)(?:一下)?(.{2,10})/,
    /(?:帮我|请)(?:查|看|找|分析)(?:一下)?(.{2,10})/,
    // 配置设置
    /(?:配置|设置)(?:一下)?(.{2,10})/,
    /(.{2,10})(?:配置|设置|参数)/,
    // 部署构建
    /(?:部署|打包|构建|编译)(?:一下)?(.{2,10})?/,
    /(.{2,10})(?:部署|发布|上线)/,
    // 常见模块关键词
    /(?:登录|注册|认证|授权|权限|用户|角色)/g,
    /(?:数据|表格|列表|详情|页面|组件|模块)/g,
    /(?:接口|API|后端|前端|服务)/g,
    /(?:数据库|SQL|查询|连接)/g,
  ];

  // 提取所有匹配的主题词
  const topics = new Set();

  for (const pattern of topicPatterns) {
    const matches = prompt.match(pattern);
    if (matches) {
      // 如果有捕获组，使用捕获的内容；否则使用整个匹配
      const topic = matches[1] || matches[0];
      // 清理主题词
      const cleanTopic = topic
        .replace(/^[一下的我给请]/, '')  // 移除无意义的前缀
        .replace(/[吗呢啊吧呀]/, '')      // 移除语气词
        .trim();

      if (cleanTopic && cleanTopic.length >= 2) {
        topics.add(cleanTopic);
      }
    }
  }

  // 如果没有匹配到具体主题，尝试提取关键名词
  if (topics.size === 0) {
    // 常见的技术关键词
    const techKeywords = [
      '登录', '注册', '认证', '授权', '权限',
      '用户', '角色', '菜单', '配置', '设置',
      '数据', '表格', '列表', '详情', '搜索',
      '导出', '导入', '上传', '下载', '删除',
      '修改', '更新', '添加', '创建', '实现',
      '优化', '改进', '修复', '部署', '构建',
      '接口', 'API', '组件', '页面', '模块',
      '数据库', 'SQL', '前端', '后端', '服务',
      '设计', '架构', '文档', '代码', '重构',
      '测试', '调试', '运行', '启动', '停止'
    ];

    for (const keyword of techKeywords) {
      if (prompt.includes(keyword)) {
        topics.add(keyword);
        // 只取前2个关键词
        if (topics.size >= 2) break;
      }
    }
  }

  // 返回主题（优先使用动词+名词的结构）
  const topicArray = Array.from(topics);
  if (topicArray.length === 0) {
    return null;
  }

  // 如果有多个主题，组合成一个短语
  return topicArray.slice(0, 2).join('');
}

/**
 * 从文件路径提取主题（模块名）
 * 例如: "frontend/src/views/login/Login.vue" -> "登录模块"
 */
function getTopicFromFiles(filePaths) {
  if (!filePaths || filePaths.length === 0) return null;

  // 常见的技术关键词映射到中文
  const keywordMap = {
    'login': '登录',
    'auth': '认证',
    'user': '用户',
    'data': '数据',
    'compare': '对比',
    'export': '导出',
    'import': '导入',
    'table': '表格',
    'list': '列表',
    'detail': '详情',
    'edit': '编辑',
    'delete': '删除',
    'create': '创建',
    'update': '更新',
    'query': '查询',
    'search': '搜索',
    'upload': '上传',
    'download': '下载',
    'setting': '设置',
    'config': '配置',
    'dashboard': '仪表盘',
    'chart': '图表',
    'report': '报告',
    'analysis': '分析',
    'monitor': '监控',
    'system': '系统',
    'admin': '管理',
    'role': '角色',
    'permission': '权限',
    'menu': '菜单',
    'navigation': '导航',
    'layout': '布局',
    'component': '组件',
    'service': '服务',
    'controller': '控制器',
    'api': '接口',
    'util': '工具',
    'helper': '助手',
    'manager': '管理器',
    'handler': '处理器'
  };

  const keywords = new Set();

  for (const filePath of filePaths) {
    // 标准化路径分隔符
    const normalized = filePath.replace(/\\/g, '/');

    // 提取路径片段
    const parts = normalized.split('/').filter(p => p && p.length > 1);

    // 取最后两个有意义的部分
    for (let i = Math.max(0, parts.length - 2); i < parts.length; i++) {
      const part = parts[i].toLowerCase();

      // 移除文件扩展名
      const nameWithoutExt = part.replace(/\.(vue|js|ts|jsx|tsx|java|py|go|rs|md)$/, '');

      // 查找中文翻译
      if (keywordMap[nameWithoutExt]) {
        keywords.add(keywordMap[nameWithoutExt]);
      } else if (nameWithoutExt.length > 2 && nameWithoutExt.length < 20 && !/^\d+$/.test(nameWithoutExt)) {
        // 如果没有找到翻译，保留原始英文名（但转为小写）
        keywords.add(nameWithoutExt);
      }
    }
  }

  // 返回最相关的关键词（取前2个，用短横线连接）
  const keywordArray = Array.from(keywords).slice(0, 2);
  return keywordArray.length > 0 ? keywordArray.join('-') : null;
}

/**
 * 检测用户是否使用了 /task 命令
 */
function detectTaskCommand(prompt) {
  if (!prompt || typeof prompt !== 'string') return null;

  // 匹配 /task 任务名称 或 /task "任务名称"
  const taskMatch = prompt.match(/^\/task\s+(.+?)(?:\n|$)/i);
  if (taskMatch) {
    let taskName = taskMatch[1].trim();
    // 移除可能的引号
    taskName = taskName.replace(/^["']|["']$/g, '');
    return taskName;
  }

  return null;
}

/**
 * 生成基于主题的文件名
 * 格式: {主题}-{日期}.md 或 {日期}-{序号}.md
 * @param {string} topic - 主题名称（支持中文）
 * @param {string} dateStr - 日期字符串 (YYYY-MM-DD)
 * @param {number} part - 分片序号
 */
function generateTopicFileName(topic, dateStr, part = 1) {
  if (topic) {
    // 保留中文，只移除不安全的字符
    const safeTopic = topic
      .replace(/[<>:"|?*\/\\]/g, '-') // 移除 Windows 文件系统不允许的字符
      .replace(/\s+/g, '-')             // 空格替换为短横线
      .replace(/-+/g, '-')              // 合并多个短横线
      .replace(/^-|-$/g, '')            // 移除首尾短横线
      .substring(0, 30);                // 限制主题长度为30字符

    const partSuffix = part > 1 ? `-part${part}` : '';
    return `${safeTopic}-${dateStr}${partSuffix}.md`;
  }

  // 如果没有主题，使用原来的格式
  return generateFileName(dateStr, getTodayIndex(dateStr));
}

/**
 * 计算两组文件路径的重叠度
 * 返回 0-1 之间的值，1 表示完全相同
 */
function calculateFileOverlap(paths1, paths2) {
  if (!paths1 || !paths2 || paths1.length === 0 || paths2.length === 0) {
    return 0;
  }

  const set1 = new Set(paths1);
  const set2 = new Set(paths2);

  // 计算交集
  const intersection = [...set1].filter(p => set2.has(p));

  // 计算相似度（Jaccard index）
  const union = new Set([...set1, ...set2]);
  return intersection.length / union.size;
}

/**
 * 检查文件是否过大，需要分 part
 */
function shouldSplitFile(filePath) {
  if (!fs.existsSync(filePath)) return false;

  const stats = fs.statSync(filePath);
  const maxSizeKB = 500; // 500KB
  const sizeKB = stats.size / 1024;

  return sizeKB > maxSizeKB;
}

/**
 * 清理问题内容（移除无意义前缀和语气词）
 * @param {string} question - 用户问题
 * @returns {string} - 清理后的问题
 */
function cleanQuestion(question) {
  if (!question || typeof question !== 'string') return '';

  return question
    .replace(/^(帮我|现在|请问|能否|能不能|可以|麻烦|请)/g, '')  // 去前缀
    .replace(/^[。？！]+/, '')                                       // 去开头标点
    .replace(/(吗|呢|吧|啊|呀)[。？！]?$/g, '')                      // 去结尾语气词
    .trim();
}

/**
 * 检测是否追问
 * @param {string} question - 用户问题
 * @returns {boolean} - 是否追问
 */
function isFollowUp(question) {
  if (!question || typeof question !== 'string') return false;

  const cleaned = question.trim();

  // 信号1：代词
  const pronouns = ['它', '他', '她', '这个', '那个', '这些', '那些', '那么', '这样', '那样'];
  if (pronouns.some(p => cleaned.includes(p))) {
    return true;
  }

  // 信号2：疑问词结尾
  if (/(呢|吗)$/.test(cleaned)) {
    return true;
  }

  // 信号3：短问题（省略主语）
  if (cleaned.length <= 10 && !cleaned.includes('？') && !cleaned.includes('?')) {
    return true;
  }

  // 信号4：特殊追问词开头
  const followUpPrefixes = ['那', '还有', '另外', '那这个', '那那个'];
  if (followUpPrefixes.some(prefix => cleaned.startsWith(prefix))) {
    return true;
  }

  return false;
}

/**
 * 同义词映射表（用于主题相似度计算）
 * 格式：标准词 -> [同义词列表]
 */
const TOPIC_SYNONYMS = {
  // 人物相关
  '孩子': ['小孩', '男孩', '女孩', '儿童', '幼儿', '宝宝', '儿子', '女儿'],
  '学生': ['小学生', '中学生', '大学生', '考生'],

  // 教育相关
  '数学教育': ['数学', '数学启蒙', '数学学习', '数学教学', '学数学'],
  '语文教育': ['语文', '语文学习', '阅读', '写作'],
  '英语教育': ['英语', '英语学习', '学英语'],

  // 动作相关
  '解决': ['咋办', '怎么办', '如何处理', '怎么做', '实现', '完成'],
  '生成': ['创建', '制作', '输出', '编写'],
  '优化': ['改进', '改善', '提升', '增强'],

  // 问题相关
  '错误': ['报错', 'bug', '问题', '故障', '异常'],
  '方案': ['方法', '策略', '思路', '计划']
};

/**
 * 将关键词标准化为统一的形式
 * @param {string} word - 原始关键词
 * @returns {string} - 标准化后的关键词
 */
function normalizeKeyword(word) {
  for (const [standard, synonyms] of Object.entries(TOPIC_SYNONYMS)) {
    if (synonyms.includes(word)) {
      return standard;
    }
  }
  return word;
}

/**
 * 从问题中提取主题关键词（简化分词）
 * @param {string} question - 用户问题
 * @returns {Array<string>} - 关键词数组
 */
function extractTopicKeywords(question) {
  if (!question || typeof question !== 'string') return [];

  const cleaned = cleanQuestion(question);

  // 简单分词（按标点符号和空格分割）
  const words = cleaned
    .replace(/[，。！？、；：""''（）【】《》\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1);  // 过滤单字

  return words;
}

/**
 * 智能总结长问题
 * @param {string} question - 用户问题
 * @returns {string} - 总结的主题
 */
function summarizeQuestion(question) {
  if (!question || typeof question !== 'string') return '';

  const cleaned = cleanQuestion(question);

  // 按优先级匹配的模式
  const patterns = [
    // 1. 问题 + 错误/解决方案
    {
      regex: /(.{10,40})(?:报错|错误|失败|有问题|不能)/,
      template: '$1问题排查与解决'
    },
    // 2. 想要/需要 + 功能
    {
      regex: /(?:想要|需要|想)(.{10,40})(?:功能|效果|特性)/,
      template: '$1功能的实现'
    },
    // 3. 如何/怎么 + 动作
    {
      regex: /(.{10,40})(?:怎么|如何|怎么做)/,
      template: '$1的实现方法'
    },
    // 4. 为什么 + 原因
    {
      regex: /(.{10,40})为什么/,
      template: '$1的原因分析'
    },
    // 5. 添加/新增/实现 + 功能
    {
      regex: /(?:添加|新增|实现|开发)(.{2,15})(?:功能|模块|页面|组件|接口)/,
      template: '$1功能的实现'
    },
    // 6. 修复/解决 + 问题
    {
      regex: /(?:修复|解决)(.{2,15})(?:问题|错误|bug)/,
      template: '$1问题的解决方案'
    },
    // 7. 优化/改进 + 对象
    {
      regex: /(?:优化|改进|改善)(.{2,15})/,
      template: '$1的优化改进'
    }
  ];

  // 尝试匹配
  for (const { regex, template } of patterns) {
    const match = cleaned.match(regex);
    if (match && match[1]) {
      return template.replace('$1', match[1]);
    }
  }

  // 降级：取前30个字符
  return cleaned.substring(0, 30);
}

/**
 * 生成智能主题（短问题直接用，长问题总结）
 * @param {string} question - 用户问题
 * @returns {string} - 主题
 */
function generateSmartTopic(question) {
  if (!question || typeof question !== 'string') return '未分类';

  // 过滤系统标签（如 <ide_opened_file>）
  let filtered = question;
  const tagPatterns = [
    /<ide_opened_file>[\s\S]*?<\/ide_opened_file>/gi,
    /<user_selection>[\s\S]*?<\/user_selection>/gi,
    /<[^>]+>[\s\S]*?<\/[^>]+>/gi  // 通用XML标签
  ];

  for (const pattern of tagPatterns) {
    filtered = filtered.replace(pattern, '').trim();
  }

  const cleaned = cleanQuestion(filtered);

  // 短问题直接使用（≤ 20字符）
  if (cleaned.length <= 20) {
    return cleaned;
  }

  // 长问题智能总结
  return summarizeQuestion(cleaned);
}

/**
 * 计算两个主题的相似度（Jaccard相似度 + 核心词加分）
 * @param {string} topic1 - 主题1
 * @param {string} topic2 - 主题2
 * @returns {number} - 相似度（0-1之间）
 */
function calculateTopicSimilarity(topic1, topic2) {
  if (!topic1 || !topic2) return 0;

  // 提取关键词
  const words1 = extractTopicKeywords(topic1);
  const words2 = extractTopicKeywords(topic2);

  if (words1.length === 0 || words2.length === 0) return 0;

  // 计算交集
  const intersection = words1.filter(w => words2.includes(w));

  // 计算并集
  const union = [...new Set([...words1, ...words2])];

  if (union.length === 0) return 0;

  // Jaccard相似度
  const jaccard = intersection.length / union.length;

  // 调试日志
  console.log(`[主题相似度] "${topic1}" vs "${topic2}"`);
  console.log(`  关键词1: ${words1.join(', ')}`);
  console.log(`  关键词2: ${words2.join(', ')}`);
  console.log(`  交集: ${intersection.join(', ')}`);
  console.log(`  相似度: ${(jaccard * 100).toFixed(0)}%`);

  return jaccard;
}

/**
 * 判断是否应该创建新文件
 * @param {string} newQuestion - 新问题
 * @param {object} currentState - 当前会话状态
 * @returns {boolean} - true=创建新文件, false=追加到当前文件
 */
function shouldCreateNewFile(newQuestion, currentState) {
  // 1. 如果没有当前文件，创建新文件
  if (!currentState.currentFile || !currentState.currentTopic) {
    return true;
  }

  // 2. 检测是否追问（最高优先级）
  if (isFollowUp(newQuestion)) {
    console.log('检测到追问 → 追加到当前文件');
    return false;  // 追加到当前文件
  }

  // 3. 优先检查时间窗口（核心原则：保持连续性）
  if (currentState.lastActivity) {
    const timeDiff = Date.now() - new Date(currentState.lastActivity).getTime();
    const timeThreshold = 10 * 60 * 1000;  // 10分钟

    if (timeDiff < timeThreshold) {
      console.log(`时间窗口内（${Math.floor(timeDiff / 1000 / 60)}分钟前）→ 追加到当前文件`);
      return false;  // 追加到当前文件
    }
  }

  // 4. 时间窗口外，再检查主题相似度
  const newTopic = generateSmartTopic(newQuestion);
  const similarity = calculateTopicSimilarity(newTopic, currentState.currentTopic);

  // 5. 高相似度：追加
  if (similarity >= 0.4) {
    console.log(`时间窗口外但相似度高（${(similarity * 100).toFixed(0)}%）→ 追加到当前文件`);
    return false;  // 追加到当前文件
  }

  // 6. 低相似度：新建（只有跨度特别大的才新建）
  console.log(`时间窗口外且相似度低（${(similarity * 100).toFixed(0)}%）→ 创建新文件`);
  return true;  // 创建新文件
}

/**
 * 生成智能文件名（日期作为文件夹，主题作为文件名）
 * @param {string} topic - 主题
 * @param {number} index - 序号（避免重名）
 * @returns {string} - 文件名
 */
function generateSmartFileName(topic, index = 0) {
  if (!topic) {
    return `conversation_${index}.md`;
  }

  // 清理主题，确保文件名安全
  const safeTopic = topic
    .replace(/[<>:"|?*\/\\]/g, '-')     // 移除不安全字符
    .replace(/\s+/g, '-')                // 空格替换为短横线
    .replace(/-+/g, '-')                 // 合并多个短横线
    .replace(/^-|-$/g, '')               // 移除首尾短横线
    .substring(0, 50);                   // 限制长度为50字符

  // 如果有索引，添加序号
  const suffix = index > 0 ? `-${index}` : '';

  return `${safeTopic}${suffix}.md`;
}

module.exports = {
  getHistoryDir,
  ensureDir,
  getDateDir,
  getDateFolder,
  generateFileName,
  getTodayIndex,
  readInput,
  formatTimestamp,
  escapeMarkdown,
  extractCodeBlocks,
  getImagesDir,
  generateImageFileName,
  downloadImage,
  saveBase64Image,
  extractImages,
  extractFilePaths,
  getTopicFromPrompt,
  getTopicFromFiles,
  generateTopicFileName,
  calculateFileOverlap,
  shouldSplitFile,
  cleanQuestion,
  isFollowUp,
  extractTopicKeywords,
  summarizeQuestion,
  generateSmartTopic,
  calculateTopicSimilarity,
  shouldCreateNewFile,
  generateSmartFileName
};
