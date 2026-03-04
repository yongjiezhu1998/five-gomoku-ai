# AI 五子棋对战平台

一个开箱即用的前端五子棋对战平台，支持：

- 人类 vs AI
- AI vs AI 自对弈
- 先手配置（人机模式）
- AI 难度切换（简单/普通/困难）
- 悔棋与重新开局

## 本地运行

这个项目是纯静态页面，无需安装依赖。

```bash
cd /home/guhuo/Linux/five
python3 -m http.server 8080
```

浏览器打开：

`http://localhost:8080`

## 技术说明

- 棋盘：`Canvas` 绘制 15x15 标准网格
- 判胜：基于最新落子做四方向连珠检测
- AI：启发式估值 + 候选点剪枝 + Negamax(alpha-beta)
- 难度：通过搜索深度与分支数控制耗时/强度
