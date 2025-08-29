const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 获取命令行参数
const args = process.argv.slice(2);
if (args.length < 1) {
    console.log('用法: node scripts/upload.js <文件路径> [标签1,标签2,...]');
    process.exit(1);
}

const filePath = args[0];
const tags = args[1] ? args[1].split(',') : [];
const fileName = path.basename(filePath, path.extname(filePath));
const fileExt = path.extname(filePath);
const targetDir = 'static/files';
const contentDir = 'content/materials';

// 确保目标目录存在
if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
}

// 复制文件到static/files目录
const targetPath = path.join(targetDir, `${fileName}${fileExt}`);
fs.copyFileSync(filePath, targetPath);
console.log(`文件已复制到: ${targetPath}`);

// 获取文件大小
const stats = fs.statSync(filePath);
const fileSize = (stats.size / (1024 * 1024)).toFixed(2) + ' MB';

// 创建内容文件
const content = `---
title: "${fileName.replace(/-/g, ' ')}"
date: ${new Date().toISOString()}
tags: [${tags.map(t => `"${t}"`).join(', ')}]
file_url: "/files/${fileName}${fileExt}"
file_size: "${fileSize}"
---

在这里添加资源描述...
`;

const contentPath = path.join(contentDir, `${fileName}.md`);
fs.writeFileSync(contentPath, content);
console.log(`内容文件已创建: ${contentPath}`);

// 提示用户
console.log('\n下一步:');
console.log('1. 编辑文件添加描述: ', contentPath);
console.log('2. 提交更改到GitHub: git add . && git commit -m "添加资源: ${fileName}" && git push');
