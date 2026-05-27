# 04 页面地图

| ID  | 页面                 | 路由                              | 平台   | 类型         | SVG 视觉参考                                          |
| --- | -------------------- | --------------------------------- | ------ | ------------ | ----------------------------------------------------- |
| M01 | 移动端书架首页       | `/library`                        | mobile | page         | `svg/02_bookshelf_discovery_detail.svg`               |
| M02 | 移动端导入解析页     | `/import`                         | mobile | page         | `svg/03_import_parse_content_governance.svg`          |
| M03 | 移动端解析预览页     | `/import/preview/:taskId`         | mobile | page         | `svg/03_import_parse_content_governance.svg`          |
| M04 | 移动端沉浸阅读态     | `/reader/:bookId`                 | mobile | reader-state | `svg/05_mobile_immersive_reading_operation_layer.svg` |
| M05 | 移动端阅读菜单态     | `/reader/:bookId`                 | mobile | reader-state | `svg/05_mobile_immersive_reading_operation_layer.svg` |
| M06 | 移动端阅读设置态     | `/reader/:bookId`                 | mobile | reader-state | `svg/05_mobile_immersive_reading_operation_layer.svg` |
| M07 | 移动端目录抽屉态     | `/reader/:bookId`                 | mobile | reader-state | `svg/05_mobile_immersive_reading_operation_layer.svg` |
| M08 | 移动端夜间阅读态     | `/reader/:bookId`                 | mobile | reader-state | `svg/05_mobile_immersive_reading_operation_layer.svg` |
| M09 | 移动端 AI 面板态     | `/reader/:bookId`                 | mobile | reader-state | `svg/07_ai_reading_enhancement.svg`                   |
| M10 | 移动端空状态/离线态  | `/library or /reader/:bookId`     | mobile | state        | `svg/06_states_exceptions_recovery.svg`               |
| M11 | 移动端书籍详情页     | `/book/:bookId`                   | mobile | page         | `svg/02_bookshelf_discovery_detail.svg`               |
| M12 | 移动端阅读进度面板   | `/reader/:bookId`                 | mobile | reader-state | `svg/05_mobile_immersive_reading_operation_layer.svg` |
| M13 | 移动端书签笔记页     | `/notes or /reader/:bookId/notes` | mobile | page         | `svg/05_mobile_immersive_reading_operation_layer.svg` |
| M14 | 移动端发现搜索页     | `/search`                         | mobile | page         | `svg/02_bookshelf_discovery_detail.svg`               |
| M15 | 移动端长文本压力页   | `/reader/:bookId`                 | mobile | stress       | `svg/05_mobile_immersive_reading_operation_layer.svg` |
| M16 | 移动端极窄屏压力页   | `/reader/:bookId`                 | mobile | stress       | `svg/05_mobile_immersive_reading_operation_layer.svg` |
| W01 | Web 书架首页         | `/library`                        | web    | page         | `svg/02_bookshelf_discovery_detail.svg`               |
| W02 | Web 导入解析页       | `/import`                         | web    | page         | `svg/03_import_parse_content_governance.svg`          |
| W03 | Web 解析预览页       | `/import/preview/:taskId`         | web    | page         | `svg/03_import_parse_content_governance.svg`          |
| W04 | Web 三栏阅读工作区   | `/reader/:bookId`                 | web    | reader-state | `svg/04_web_immersive_reading_workspace.svg`          |
| W05 | Web 夜间阅读设置页   | `/reader/:bookId`                 | web    | reader-state | `svg/04_web_immersive_reading_workspace.svg`          |
| W06 | Web 解析质量/状态页  | `/import/preview/:taskId`         | web    | state        | `svg/06_states_exceptions_recovery.svg`               |
| W07 | Web 书籍详情页       | `/book/:bookId`                   | web    | page         | `svg/02_bookshelf_discovery_detail.svg`               |
| W08 | Web 发现搜索页       | `/search`                         | web    | page         | `svg/02_bookshelf_discovery_detail.svg`               |
| W09 | Web 设置与存储页     | `/settings`                       | web    | page         | `svg/08_profile_settings_sync.svg`                    |
| W10 | Web 笔记与 AI 资产页 | `/notes`                          | web    | page         | `svg/07_ai_reading_enhancement.svg`                   |
| W11 | Web 宽屏压力页       | `/reader/:bookId`                 | web    | stress       | `svg/04_web_immersive_reading_workspace.svg`          |
