# NUAA Guide - 南京航空航天大学校园指北

[![Deploy to GitHub Pages](https://github.com/sssssea6/nuaa-guide/actions/workflows/deploy.yml/badge.svg)](https://github.com/sssssea6/nuaa-guide/actions/workflows/deploy.yml)
[![Validate Site Build](https://github.com/sssssea6/nuaa-guide/actions/workflows/validate-site.yml/badge.svg)](https://github.com/sssssea6/nuaa-guide/actions/workflows/validate-site.yml)

> 信息本该自由，学习本应简单。

**NUAA Guide** 是一个面向南京航空航天大学 (NUAA) 学生的非官方资源共享平台。致力于提供免费、开放的学习资料、实用的校园生活指南、软件资源和常用链接，让南航生活更加便捷。

**网站链接:** [https://nuaaguide.online/](https://nuaaguide.online/) 

## ✨ 主要功能

* 📚 **海量学习资料:** 收集整理各科目历年试卷、习题解答等。按科目分类，支持标签检索。
* 🧭 **实用工具:** 提供校园生活相关的实用信息和服务，如免费“龙猫代跑”工具。
* 💻 **正版软件:** 校内可用正版软件的获取与安装指南。
* 🔗 **常用网址:** 快速访问教务处、图书馆、校园邮箱等常用网站。
* 🔍 **全站搜索:** 基于 FlexSearch 的中文友好客户端搜索，轻松找到所需资源。

## 🚀 技术栈

* **框架:** [Hugo](https://gohugo.io/) 
* **内容存储:** Markdown + [Cloudflare R2](https://www.cloudflare.com/zh-cn/developer-platform/r2/) (用于存储资料文件)
* **搜索:** [FlexSearch](https://github.com/nextapps-de/flexsearch)
* **部署:** [GitHub Pages](https://pages.github.com/)
* **自动化:** [GitHub Actions](https://github.com/features/actions) (用于内容自动生成、资源上传、网站部署与验证)
* **前端:** HTML, CSS, JavaScript ([Swup.js](https://swup.js.org/) 用于页面切换)

## 🤝 如何贡献

本仓库配置了自动化流程，方便添加新的学习资料：

1.  **准备文件:** 确保你的文件 (PDF, DOCX, ZIP 等) 符合命名规范：
    `资源完整名称__标签1_标签2_...__可选的简短描述.文件扩展名`
    * `资源完整名称`: 会成为页面的标题。
    * `__`: 双下划线作为分隔符。
    * `标签`: 多个标签用单个下划线 `_` 分隔，第一个标签通常作为该资料所属的**科目**。标签会用于网站分类和搜索。
    * `可选的简短描述`: (可选) 文件名中第三部分（如果有）会被用作页面的简短描述。
    * **示例:** `高等数学I2023年上册期末__高等数学_高数_期末_2023__南航高数I期末考试卷.pdf`
2.  **提交文件:**
    * **(推荐方式，需要仓库写入权限)** 将准备好的文件放入仓库的 `static/files/` 目录下。
    * 推送更改到 GitHub 仓库。
3.  **自动化处理:** GitHub Actions 将会自动执行以下操作：
    * 运行脚本 (`scripts/improved_auto_generate.py`) 解析文件名，在 `content/materials/` 目录下生成对应的 `.md` 文件。
    * 将 `static/files/` 中的文件上传到 Cloudflare R2 存储。
    * 从 `static/files/` 目录中删除已上传的文件（保持仓库轻量）。
    * 将新生成的 `.md` 文件提交到仓库。
    * 触发网站的自动构建和部署。

如果你没有仓库写入权限，可以通过以下方式联系维护者提交资料：

* **邮箱:** sssssea666@gmail.com
* **QQ:** 2773849038
* **小红书:** 坐坐坐忘忘忘 / 26506316071

## 本地开发

如果你想在本地运行或开发此网站：

1.  **安装 Hugo:** 参考 [Hugo 官方文档](https://gohugo.io/installation/) 安装 Hugo Extended 版本。
2.  **克隆仓库:** `git clone https://github.com/local-user6/NUAA-Guide` 
3.  **进入目录:** `cd NUAA-Guide`
4.  **运行开发服务器:** `hugo server -D`
5.  在浏览器中打开生成的地址

**注意:** 本地运行时，学习资料的下载链接会指向 R2 上的实际文件。本地开发服务器**不会**执行文件上传到 R2 的操作。

## MCP 测试

当前工作区内补充了一份 MCP 工具全面测试与调用说明：

- [plugins/MCP_TOOL_TEST_REPORT.md](plugins/MCP_TOOL_TEST_REPORT.md)
- [plugins/MCP_PERMISSION_MAXIMIZATION_GUIDE.md](plugins/MCP_PERMISSION_MAXIMIZATION_GUIDE.md)

## 🙏 致谢

* 感谢所有分享学习资料的同学！
* 龙猫代跑功能衍生自 [BeiyanYunyi/totoro-paradise](https://github.com/BeiyanYunyi/totoro-paradise) 项目，并受到 SHLE1 的启发。

## ❤️ 支持项目

如果这个项目对你有帮助，欢迎通过网站页脚的捐赠渠道支持维护者！

---
