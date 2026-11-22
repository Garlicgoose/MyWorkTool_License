# Cairn / ShipmentTrack 控制

两个程序共用根目录的 `ShipmentTrack_license.json`。文件由 Actions 自动签名，私钥只保存在仓库的 Actions Secret 中，不提交到 Git。

在仓库的 Actions 页选择 **Desktop controls**，点击 **Run workflow**：

- action=`set-mode`：设置状态；app=`all` 同时设置两个程序，也可选 `cairn` 或 `shipment`。
- mode=`full` / `restricted` / `disabled` / `remove`。
- machine_digest 留空为全局设置；填写 64 位机器摘要为单机设置。设置新机器的状态会自动录入该机器。
- action=`set-machine`：公共机器开关，`enabled=true` 录入/开启，false 关闭；这项对两个程序共同生效。
- action=`delete-machine`：删除该机器记录及所有相关单机状态，之后跟随全局设置。

## 优先级

1. 已录入的机器豁免全部全局状态，默认 full。
2. 单机有明确状态时，按单机状态执行。程序专用状态优先于两个程序共用的单机状态。
3. 公共机器条目为 false 时关闭；明确单机 remove 时执行移除。
4. 机器记录删除后按对应程序的全局状态执行；对应程序没有专用全局状态时跟随 all。
5. 旧的 global_enabled=false 仍关闭未录入的机器，不影响已开启的单机记录。

示例：A 机器设 cairn/full，B 机器设 shipment/restricted，C 机器设 all/disabled，可以分别生效。全局 remove 也不会影响已录入机器，只有针对该机器的 remove 才作用于它。

成功运行后检查 `control-result.json`：status=completed，revision 增加。不要手工修改签名控制文件；手工修改会使签名失效。完整功能机器的业务处理不加下载延时。

## 发布信息

两个程序均在本仓库 Releases 提供已校验的发布包：

- [Cairn 1.09 安装包](https://github.com/Garlicgoose/MyWorkTool_License/releases/tag/cairn-v1.09)
- [ShipmentTrack 最终版完整 ZIP](https://github.com/Garlicgoose/MyWorkTool_License/releases/tag/shipment-final-v1.4.0)

Cairn 更新清单位于 cairn/update.json。首次安装 ShipmentTrack 请使用完整 ZIP。程序新源码暂未公开，公开仓库只提供发布包和管理工具。此文档不进入程序业务界面或安装包更新内容。
