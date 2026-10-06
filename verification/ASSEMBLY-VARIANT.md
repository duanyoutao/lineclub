# 逐文档模型让逐帧循环死掉（2026-10-05）

用户反馈：打开大炎（X-044）会卡住——选中后抽取/特写过渡永远走不完、右侧详情界面不出现，之后**整个场景的动画都停了**，只有刷新能恢复。

## 根因

1. `CardAppearance.prepare/apply/dispose` 遍历 `model.children` 时**把每个子节点都当成 Mesh** 用。
2. 变体安装 `Scene.installVariant()` 往 `this.model` 里加的是一个 **`THREE.Group`**：徽记是「正面 + 侧壁」双材质对象，导出即「组 + 多网格」。
3. `apply()` 因此对组取 `mesh.material.opacity`，而组的 `material` 是 `undefined`：

```
TypeError: Cannot set properties of undefined (setting 'opacity')
    at CardAppearance.apply   (src/appearance.ts, 原第 151 行)
    at Scene.installVariant   (src/scene.ts, 原第 941 行)
    at updateAssemblyVariant 的 .then   (src/scene.ts, 原第 898 行)
```

4. 抛错发生在 `this.model.add(group)` **之后**，而 `scene.ts:898` 的 `void loading.then(...)` **没有 `.catch`** → 未处理拒绝，且变体组已半装进模型。
5. 此后**每一帧**的 `apply(this.model, …)` 都在同一个组上再抛一次 → rAF 循环死亡。

现象与表现因此完全对应：过渡不完成、详情不出现、全部动画停止、必须刷新。

## 修法

- `src/appearance.ts`：新增 `eachMesh(group, visit)` —— 只访问 Mesh，并向下钻一层部件组，**永不把组当 Mesh**；`prepare` / `apply` / `dispose` 三处改用它。是"钻进去"而不是"跳过去"，所以徽记仍然参与画质/清晰度/主题的每帧更新。
- `src/scene.ts`：两条变体安装链都补 `.catch()`，新增 `variantFailed()` —— 丢弃缓存的失败 Promise、退回 stock 光学组、打一条 `console.warn`。变体出问题最多是"没有徽记"，不会再拖死渲染循环。

## 验证

同一套脚本（`.tools/yan-repro3.mjs`：签入 → 阵列按 ↓ 走到 X-044 → 回车 → 采样 4 秒），修复前后各跑一次，两次都重新构建：

| | 修复前 | 修复后 |
| --- | --- | --- |
| 未捕获异常 | `TypeError: … setting 'opacity'`（栈见上） | **0 条** |
| 状态 | 选中 X-044 但 `mode: archive`、详情不出现、动画死亡 | `mode: detail`、`detailVisible: true` |
| 帧率 | 循环已死 | 46 fps |
| 变体资产 | 全程**未请求** yan 资产 | `/assets/archive-cassette-yan.glb` 正常请求 |
| 404 | 无 | 无 |

内容校验（`validateContent` / `validatePersonnel` / `validateAssignments`）在提交前全部通过。

## 过程中的自摆乌龙（写给未来的自己）

我最初三轮复现都跑在**过期的 `dist`** 上：`content/archives.json` 已被改过（新增 X-041..X-044），而构建早于那次修改，于是构建产物里根本没有大炎——“搜索搜不到 X-044”“阵列走到 X-042 回绕到 X-001”“`select(43)` 变成 X-001”全是这个原因，**不是产品缺陷**。

**规则：改动过内容或模型之后，复现前必须先重新构建。** 过期构建会让"看起来像产品 bug"的假象连出三条。
