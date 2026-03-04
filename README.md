# AI 棋类对战平台

一个开箱即用的前端棋类对战平台，支持：

- 五子棋：人类 vs AI、AI vs AI、三档难度
- 象棋：人类 vs AI、AI vs AI、基础规则与合法走子校验
- 可在同一页面切换游戏类型（兼容多棋种）
- 先手配置、悔棋、重新开局

## 本地运行

这个项目是纯静态页面，无需安装依赖。

```bash
cd /home/guhuo/Linux/five
python3 -m http.server 8080
```

浏览器打开：

`http://localhost:8080`

## 技术说明

- 前端：纯静态 `HTML + CSS + JavaScript`，`Canvas` 渲染棋盘
- 五子棋 AI：启发式估值 + 候选剪枝 + Negamax(alpha-beta)
- 象棋 AI：合法着法生成 + 棋子估值 + Negamax(alpha-beta)
- 架构：统一控制面板 + 按游戏类型切换规则与渲染
