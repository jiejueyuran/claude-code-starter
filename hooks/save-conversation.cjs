const fs = require('fs');
const path = require('path');
const {
  getHistoryDir,
  ensureDir,
  getDateFolder,
  readInput,
  formatTimestamp,
  escapeMarkdown,
  getImagesDir,
  generateImageFileName,
  downloadImage,
  saveBase64Image,
  extractImages,
  extractFilePaths,
  generateSmartTopic,
  calculateTopicSimilarity,
  shouldCreateNewFile,
  generateSmartFileName,
  shouldSplitFile
} = require('./utils.cjs');
const {
  getOrCreateSession,
  updateSessionState,
  cleanupOldSessions
} = require('./session-tracker.cjs');

/**
 * 生成 Markdown 文件头部
 */
function generateHeader(metadata) {
  return `---
title: ${metadata.title}
date: ${metadata.date}
sessionId: ${metadata.sessionId}
model: ${metadata.model || 'unknown'}
tags:
  - claude-code
  - conversation
---

# ${metadata.title}

**日期**: ${metadata.date}
**会话 ID**: \`${metadata.sessionId}\`
**模型**: ${metadata.model || 'N/A'}

---

`;
}

/**
 * 追加用户问题（包含图片）
 */
function appendUserPrompt(filePath, prompt, timestamp, images = []) {
  let content = `
## 👤 用户问题

**时间**: ${timestamp}

${prompt}
`;

  // 如果有图片，添加到用户问题中
  if (images.length > 0) {
    content += `

### 📎 附件图片 (${images.length}张)

`;
    for (let i = 0; i < images.length; i++) {
      const mdFileName = path.basename(filePath);
      const imgFileName = generateImageFileName(mdFileName, i + 1);
      const relativePath = `./images/${imgFileName}`;

      content += `
<details>
<summary>图片 ${i + 1}</summary>

![用户图片 ${i + 1}](${relativePath})

**文件**: \`${relativePath}\`

</details>
`;
    }
  }

  content += `

---

`;
  fs.appendFileSync(filePath, content, 'utf8');
}

/**
 * 追加 AI 回答
 */
function appendAIResponse(filePath, response, timestamp) {
  const content = `
## 🤖 Claude 回答

**时间**: ${timestamp}

${response}

---
`;
  fs.appendFileSync(filePath, content, 'utf8');
}

/**
 * 追加用户图片
 */
function appendUserImages(filePath, images, timestamp, imagesDir) {
  if (images.length === 0) return '';

  const mdFileName = path.basename(filePath);
  let imageRefs = [];

  for (let i = 0; i < images.length; i++) {
    const imgFileName = generateImageFileName(mdFileName, i + 1);
    const imgPath = path.join(imagesDir, imgFileName);
    const relativePath = `./images/${imgFileName}`;

    imageRefs.push({
      fileName: imgFileName,
      relativePath: relativePath,
      localPath: imgPath
    });
  }

  const content = `
## 📷 用户图片

**时间**: ${timestamp}
**图片数量**: ${images.length}

${imageRefs.map((img, idx) => `
### 图片 ${idx + 1}

**文件**: \`${img.relativePath}\`

![用户图片 ${idx + 1}](${img.relativePath})

`).join('')}

---
`;
  fs.appendFileSync(filePath, content, 'utf8');
  return imageRefs;
}

/**
 * 主函数
 */
async function main() {
  try {
    // 清理过期会话
    cleanupOldSessions();

    // 读取 hook 输入
    let input;
    try {
      input = await readInput();
    } catch (e) {
      // 如果没有输入数据，说明是手动运行或其他情况
      process.exit(0);
      return;
    }

    const hookEvent = input.hook_event_name;
    const sessionId = input.session_id;
    const timestamp = formatTimestamp(new Date().toISOString());

    // 获取用户输入的 prompt（仅用于 UserPromptSubmit 事件）
    let userPrompt = '';
    if (hookEvent === 'UserPromptSubmit') {
      userPrompt = input.prompt || '';
    }

    // 更新会话状态
    const sessionState = updateSessionState(sessionId, {
      lastActivity: new Date().toISOString()
    });

    // 确保历史目录和日期文件夹存在
    const historyDir = getHistoryDir();
    ensureDir(historyDir);

    // 获取日期文件夹（YYYY-MM-DD）
    const dateFolder = getDateFolder();
    const dateDir = path.join(historyDir, dateFolder);
    ensureDir(dateDir);

    // 提取文件路径（用于调试，不再用于判断）
    const extractedPaths = extractFilePaths(userPrompt);

    // 智能生成主题（短问题直接用，长问题总结）
    let currentTopic = null;
    if (userPrompt) {
      currentTopic = generateSmartTopic(userPrompt);
    }

    // 判断是否应该创建新文件
    let filePath = sessionState.currentFile;
    let createNew = false;

    if (!filePath || !fs.existsSync(filePath)) {
      // 没有现有文件，肯定要创建
      createNew = true;
    } else if (userPrompt) {
      // 使用新的判断逻辑（追问检测 + 主题相似度 + 时间辅助）
      createNew = shouldCreateNewFile(userPrompt, sessionState);
    }

    // 检查文件是否需要分 part
    if (!createNew && filePath && fs.existsSync(filePath)) {
      const needSplit = shouldSplitFile(filePath);
      if (needSplit) {
        createNew = true;
      }
    }

    // 如果需要创建新文件
    if (createNew) {
      // 检查是否是文件分片
      if (filePath && fs.existsSync(filePath) && sessionState.currentTopic) {
        const needSplit = shouldSplitFile(filePath);
        if (needSplit) {
          // 文件过大，创建 part2
          const currentPart = (sessionState.currentPart || 1) + 1;
          const fileName = generateSmartFileName(sessionState.currentTopic, currentPart);
          filePath = path.join(dateDir, fileName);

          // 生成文件头部
          const header = generateHeader({
            title: `任务: ${sessionState.currentTopic} (Part ${currentPart})`,
            date: timestamp,
            sessionId: sessionId,
            model: input.model || 'unknown'
          });

          fs.writeFileSync(filePath, header, 'utf8');

          const partInfo = `
> **📌 任务主题**: ${sessionState.currentTopic}
> **接续自**: Part ${currentPart - 1}
> **开始时间**: ${timestamp}

---

`;
          fs.appendFileSync(filePath, partInfo, 'utf8');

          // 更新会话状态
          updateSessionState(sessionId, {
            currentFile: filePath,
            currentPart: currentPart,
            promptCount: 0,
            responseCount: 0
          });
        } else {
          // 不是分片，是全新的话题
          // 如果没有主题，使用当前问题生成
          if (!currentTopic) {
            currentTopic = '未分类话题';
          }

          // 检查是否已存在同名文件，如果存在添加序号
          let fileIndex = 0;
          let fileName = generateSmartFileName(currentTopic, fileIndex);
          let testPath = path.join(dateDir, fileName);

          while (fs.existsSync(testPath)) {
            fileIndex++;
            fileName = generateSmartFileName(currentTopic, fileIndex);
            testPath = path.join(dateDir, fileName);
          }

          filePath = testPath;

          // 生成文件头部
          const header = generateHeader({
            title: currentTopic ? `任务: ${currentTopic}` : `Claude Code 对话记录`,
            date: timestamp,
            sessionId: sessionId,
            model: input.model || 'unknown'
          });

          fs.writeFileSync(filePath, header, 'utf8');

          // 更新会话状态
          updateSessionState(sessionId, {
            currentFile: filePath,
            currentTopic: currentTopic,
            currentPart: 1,
            promptCount: 0,
            responseCount: 0
          });
        }
      } else {
        // 首次创建文件
        // 如果没有主题，使用当前问题生成
        if (!currentTopic) {
          currentTopic = '未分类话题';
        }

        // 检查是否已存在同名文件，如果存在添加序号
        let fileIndex = 0;
        let fileName = generateSmartFileName(currentTopic, fileIndex);
        let testPath = path.join(dateDir, fileName);

        while (fs.existsSync(testPath)) {
          fileIndex++;
          fileName = generateSmartFileName(currentTopic, fileIndex);
          testPath = path.join(dateDir, fileName);
        }

        filePath = testPath;

        // 生成文件头部
        const header = generateHeader({
          title: currentTopic ? `任务: ${currentTopic}` : `Claude Code 对话记录`,
          date: timestamp,
          sessionId: sessionId,
          model: input.model || 'unknown'
        });

        fs.writeFileSync(filePath, header, 'utf8');

        // 更新会话状态
        updateSessionState(sessionId, {
          currentFile: filePath,
          currentTopic: currentTopic,
          currentPart: 1,
          promptCount: 0,
          responseCount: 0
        });
      }
    }

    // 根据事件类型处理
    if (hookEvent === 'UserPromptSubmit') {
      // 先读取 transcript 保存之前的 AI 回答
      let newResponses = [];
      if (input.transcript_path && fs.existsSync(input.transcript_path)) {
        try {
          const transcriptLines = fs.readFileSync(input.transcript_path, 'utf8')
            .split('\n')
            .filter(line => line.trim());

          // 获取已保存的回答数
          const savedCount = sessionState.responseCount || 0;
          let allResponses = [];

          for (const line of transcriptLines) {
            try {
              const data = JSON.parse(line);
              // 正确的格式检查：type === 'assistant' 且 message.role === 'assistant'
              if (data.type === 'assistant' && data.message?.role === 'assistant') {
                // 从 content 数组中提取 type === 'text' 的内容
                if (Array.isArray(data.message.content)) {
                  for (const item of data.message.content) {
                    if (item.type === 'text' && item.text) {
                      allResponses.push(item.text);
                    }
                  }
                }
              }
            } catch (e) {
              // 忽略解析错误的行
            }
          }

          // 只保存新增的回答
          newResponses = allResponses.slice(savedCount);

          for (const response of newResponses) {
            appendAIResponse(filePath, response, timestamp);
          }
        } catch (e) {
          // 忽略读取错误
        }
      }

      // 更新回答计数
      if (newResponses.length > 0) {
        updateSessionState(sessionId, {
          responseCount: (sessionState.responseCount || 0) + newResponses.length
        });
      }

      // 提取并保存用户图片
      let images = [];
      if (input.transcript_path && fs.existsSync(input.transcript_path)) {
        try {
          images = extractImages(input.transcript_path);

          if (images.length > 0) {
            // 确保图片目录存在（使用日期文件夹）
            const imagesDir = path.join(dateDir, 'images');
            ensureDir(imagesDir);

            // 下载/保存图片
            for (let i = 0; i < images.length; i++) {
              try {
                const mdFileName = path.basename(filePath);
                const imgFileName = generateImageFileName(mdFileName, i + 1);
                const imgPath = path.join(imagesDir, imgFileName);

                if (images[i].type === 'url') {
                  await downloadImage(images[i].url, imgPath);
                } else if (images[i].type === 'base64') {
                  await saveBase64Image(images[i].data, imgPath);
                }
              } catch (e) {
                // 继续处理下一张图片
              }
            }
          }
        } catch (e) {
          // 忽略处理错误
        }
      }

      // 保存当前用户问题（包含图片）
      const prompt = input.prompt || '';
      appendUserPrompt(filePath, prompt, timestamp, images);

      updateSessionState(sessionId, {
        promptCount: (sessionState.promptCount || 0) + 1
      });

    } else if (hookEvent === 'Stop') {
      // 读取 transcript 文件获取完整对话
      let transcriptContent = '';
      if (input.transcript_path && fs.existsSync(input.transcript_path)) {
        try {
          const transcriptLines = fs.readFileSync(input.transcript_path, 'utf8')
            .split('\n')
            .filter(line => line.trim());

          for (const line of transcriptLines) {
            try {
              const data = JSON.parse(line);
              // 正确的格式检查
              if (data.type === 'assistant' && data.message?.role === 'assistant') {
                // 从 content 数组中提取 type === 'text' 的内容
                if (Array.isArray(data.message.content)) {
                  for (const item of data.message.content) {
                    if (item.type === 'text' && item.text) {
                      transcriptContent += item.text + '\n\n';
                    }
                  }
                }
              }
            } catch (e) {
              // 忽略解析错误的行
            }
          }
        } catch (e) {
          // 忽略读取错误
        }
      }

      // 保存 AI 回答
      if (transcriptContent.trim()) {
        appendAIResponse(filePath, transcriptContent.trim(), timestamp);
        updateSessionState(sessionId, {
          responseCount: (sessionState.responseCount || 0) + 1
        });
      }

      // 记录会话结束
      const endContent = `
## 📋 会话总结

**结束时间**: ${timestamp}
**总问题数**: ${sessionState.promptCount || 0}
**总回答数**: ${(sessionState.responseCount || 0) + 1}

---

`;
      fs.appendFileSync(filePath, endContent, 'utf8');
    }

    process.exit(0);

  } catch (error) {
    process.exit(1);
  }
}

// 运行主函数
main();
