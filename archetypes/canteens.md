<!-- archetypes/canteens.md -->
---
title: "{{ replace .Name "-" " " | title }}"
date: {{ .Date }}
location: ""
rating: 4.0
price_range: "5-15元"
recommended_dishes: ["", ""]
opening_hours: "07:00-20:00"
tags: ["食堂", ""]
summary: ""
draft: true
---

## 食堂简介

## 推荐菜品

### 招牌菜
- 

### 性价比之选
- 

## 就餐体验

### 环境
- 

### 服务
- 

## 实用信息
- **位置**：{{ .Params.location }}
- **营业时间**：{{ .Params.opening_hours }}
- **人均消费**：{{ .Params.price_range }}
