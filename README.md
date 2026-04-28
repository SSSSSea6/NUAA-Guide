# NUAA Guide

[![Deploy to GitHub Pages](https://github.com/sssssea6/nuaa-guide/actions/workflows/deploy.yml/badge.svg)](https://github.com/sssssea6/nuaa-guide/actions/workflows/deploy.yml)
[![Validate Site Build](https://github.com/sssssea6/nuaa-guide/actions/workflows/validate-site.yml/badge.svg)](https://github.com/sssssea6/nuaa-guide/actions/workflows/validate-site.yml)

南京航空航天大学校园指北，一个非官方的校园资料和工具站。

网站地址：[https://www.nuaaguide.online/](https://www.nuaaguide.online/)

这里主要放一些学生会用到的东西：

- 课程资料、试卷、习题解答等学习资源
- 校园生活相关的工具和入口
- 常用网站链接
- 正版软件获取和安装说明
- 站内搜索

## 技术栈

- Hugo
- Markdown
- FlexSearch
- GitHub Pages
- GitHub Actions
- Cloudflare R2

## 添加资料

有仓库写入权限的话，可以把文件放到 `static/files/` 目录，再推送到 GitHub。

推荐文件名格式：

```text
资源完整名称__标签1_标签2_标签3__简短描述.文件扩展名
```

示例：

```text
高等数学I2023年上册期末__高等数学_高数_期末_2023__南航高数I期末考试卷.pdf
```

推送后，GitHub Actions 会自动生成资料页面、上传文件到 R2，并重新构建网站。

没有仓库写入权限，也可以联系维护者提交资料：

- 邮箱：sssssea666@gmail.com
- QQ：2773849038
- 小红书：坐坐坐忘忘忘 / 26506316071

## 本地运行

需要先安装 Hugo Extended。

```bash
git clone https://github.com/local-user6/NUAA-Guide
cd NUAA-Guide
hugo server -D
```

浏览器打开终端里显示的本地地址即可。

生产构建检查：

```bash
hugo --minify
```

本地运行只会预览网站，不会上传资料文件到 R2。

## 说明

本项目不是学校官方项目，内容主要来自公开信息和同学投稿。资料可能存在过期、缺页或标注不准确的情况，发现问题可以提 issue 或联系维护者。

## 致谢

感谢所有分享资料和反馈问题的同学。

龙猫代跑功能衍生自 [BeiyanYunyi/totoro-paradise](https://github.com/BeiyanYunyi/totoro-paradise)，并受到 SHLE1 的启发。
