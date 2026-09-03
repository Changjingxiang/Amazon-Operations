(function () {
  'use strict';

  // The production bundle is intentionally kept untouched here.  This small
  // enhancement is loaded after it and adds the ASIN editor, monthly ABA CSV
  // import controls, ABA comparison columns, competitor settings/drawers, and
  // the one-click SIF batch-import control to the existing web UI.
  const ASIN_PATTERN = /^B0[A-Z0-9]{8}$/;
  const STYLE_ID = 'keyword-tracker-asin-editor-style';
  const EDITOR_ATTR = 'data-parent-asin-editor';
  const BATCH_ATTR = 'data-sif-batch-import';
  const ABA_IMPORT_ATTR = 'data-aba-monthly-import';
  const ABA_TABLE_ATTR = 'data-aba-comparison-columns';
  const MATRIX_LATEST_SCROLL_ATTR = 'data-matrix-latest-date-aligned';
  const COMPETITOR_SETTINGS_ATTR = 'data-competitor-settings';
  const COMPETITOR_SIDEBAR_ATTR = 'data-competitor-sidebar-toggle';
  const COMPETITOR_KEYWORD_ATTR = 'data-competitor-keyword-button';
  const COMPETITOR_DRAWER_ID = 'keyword-tracker-competitor-drawer';
  const COMPETITOR_TOP_LEVEL_ATTR = 'data-competitor-top-level';
  const COMPETITOR_LIST_ATTR = 'data-competitor-sidebar-list';
  const COMPETITOR_ITEM_ATTR = 'data-competitor-sidebar-item';
  const AUTO_BATCH_CAPTURE_ATTR = 'data-sif-auto-batch-capture';
  const MATRIX_HOVER_ATTR = 'data-competitor-matrix-hover';
  const MATRIX_BUBBLE_ID = 'keyword-tracker-matrix-competitor-bubble';
  // The comparison bubble may survive a short pointer gap while the table's
  // row/column highlight is cleared synchronously by MatrixView.  Keeping
  // this timer local to the bubble prevents its grace period from leaking
  // into the table hover lifecycle.
  const MATRIX_BUBBLE_HIDE_DELAY = 240;
  const MATRIX_BUBBLE_SHOW_DELAY = 210;
  const MATRIX_HOVER_DELEGATED_ATTR = 'data-matrix-hover-delegated';
  let sidebarDataCache = null;
  let sidebarDataPromise = null;
  let matrixDataCache = null;
  let matrixDataPromise = null;
  let matrixLookupCache = null;
  let matrixBubbleShowTimer = null;
  let matrixBubbleToken = 0;
  let matrixBubbleHideTimer = null;
  // Keep the actual cell reference, not only the keyword string stamped on
  // the bubble. React can remove a hovered matrix row without dispatching a
  // pointerout event (tab/product switches and virtualized rows do this), so
  // the reference lets the mutation observer invalidate a stale popup.
  let matrixBubbleAnchorCell = null;
  let matrixBubbleAnchorTable = null;
  const ABA_COUNTRIES = [
    { code: 'US', label: '美国站' },
    { code: 'DE', label: '德国站' },
    { code: 'UK', label: '英国站' },
    { code: 'JP', label: '日本站' },
    { code: 'CA', label: '加拿大站' },
    { code: 'FR', label: '法国站' },
    { code: 'ES', label: '西班牙站' },
    { code: 'IT', label: '意大利站' },
  ];

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .settings-asin-editor{margin:0 0 10px;padding:10px;border:1px solid #b8d9df;border-radius:9px;background:#f5fdff}
      .settings-asin-editor-title{display:block;margin-bottom:7px;color:#245b68;font-size:11px;font-weight:800}
      .settings-asin-editor-row{display:flex;align-items:center;gap:7px}
      .settings-asin-editor-row input{box-sizing:border-box;min-width:0;flex:1;height:32px;border:1px solid #9fc5cc;border-radius:7px;background:#fff;padding:0 8px;color:#25354d;font:700 12px Inter,"Microsoft YaHei",sans-serif;text-transform:uppercase;outline:0}
      .settings-asin-editor-row input:focus{border-color:#27c7d9;box-shadow:0 0 0 3px #27c7d921}
      .settings-asin-editor-row input[aria-invalid="true"]{border-color:#d85454;background:#fff7f5;box-shadow:0 0 0 3px #d8545420}
      .settings-asin-save{flex:0 0 auto;height:32px;border:1px solid #178b9a;border-radius:7px;background:#27c7d9;color:#173b64;padding:0 10px;font:800 11px Inter,"Microsoft YaHei",sans-serif;cursor:pointer;white-space:nowrap}
      .settings-asin-save:hover:not(:disabled){background:#13b6c9;transform:translateY(-1px)}
      .settings-asin-save:disabled{cursor:wait;opacity:.58}
      .settings-asin-help{display:block;margin-top:6px;color:#66818a;font-size:10px;line-height:1.45}
      .settings-asin-status{display:block;margin-top:6px;color:#16815b;font-size:10px;line-height:1.45}
      .settings-asin-status.is-error{color:#b43b3b}
      .sif-all-import-button{min-width:188px!important;border-color:#173b64!important;background:#173b64!important;color:#fff!important}
      .sif-all-import-button:hover:not(:disabled){background:#245a8e!important;transform:translateY(-1px)}
      .sif-all-import-button:disabled{cursor:wait;opacity:.65}
      .sif-all-import-status{display:block;flex:0 1 280px;min-width:120px;max-width:300px;margin:5px 0 0;color:#547089;font-size:11px;line-height:1.4;white-space:normal}
      .sif-all-import-status.is-error{color:#b43b3b}
      .settings-modal{max-height:calc(100vh - 36px);overflow:auto}
      .settings-aba-import{margin:14px 0 12px;padding:13px;border:1px solid #d5c2ec;border-radius:11px;background:linear-gradient(135deg,#fbf8ff,#f5fbff)}
      .settings-aba-import-title{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;color:#49356d;font-size:13px;font-weight:800}
      .settings-aba-import-title small{color:#7a6a96;font-size:10px;font-weight:600}
      .settings-aba-import-help{display:block;margin:0 0 10px;color:#6e7890;font-size:10px;line-height:1.55}
      .settings-aba-import-fields{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:9px}
      .settings-aba-import-fields label{display:flex;min-width:0;flex-direction:column;gap:4px;color:#52617b;font-size:10px;font-weight:700}
      .settings-aba-import-fields input,.settings-aba-import-fields select{box-sizing:border-box;width:100%;height:31px;border:1px solid #c9b7df;border-radius:7px;background:#fff;padding:0 7px;color:#25354d;font:700 11px Inter,"Microsoft YaHei",sans-serif;outline:0}
      .settings-aba-import-fields input:focus,.settings-aba-import-fields select:focus{border-color:#9066c4;box-shadow:0 0 0 3px #9066c421}
      .settings-aba-file{display:block;width:100%;margin:0 0 9px;color:#52617b;font-size:10px;font-weight:700}
      .settings-aba-file input{box-sizing:border-box;width:100%;margin-top:4px;padding:5px;border:1px dashed #b9a2d7;border-radius:7px;background:#fff;color:#52617b;font:600 10px Inter,"Microsoft YaHei",sans-serif}
      .settings-aba-import-button{width:100%;height:34px;border:1px solid #6947a0;border-radius:8px;background:#7650b5;color:#fff;font:800 12px Inter,"Microsoft YaHei",sans-serif;cursor:pointer}
      .settings-aba-import-button:hover:not(:disabled){background:#633e9d;transform:translateY(-1px)}
      .settings-aba-import-button:disabled{cursor:wait;opacity:.6}
      .settings-aba-import-status{display:block;min-height:15px;margin-top:7px;color:#3d6f74;font-size:10px;line-height:1.45;white-space:pre-wrap}
      .settings-aba-import-status.is-error{color:#b43b3b}
      .settings-aba-imported{margin-top:9px;border-top:1px solid #e6def0;padding-top:8px}
      .settings-aba-imported-title{display:block;margin-bottom:4px;color:#684a8b;font-size:10px;font-weight:800}
      .settings-aba-imported-list{display:grid;gap:3px;max-height:112px;overflow:auto}
      .settings-aba-imported-item{display:flex;align-items:center;justify-content:space-between;gap:6px;color:#657389;font-size:10px;line-height:1.35}
      .settings-aba-imported-item strong{color:#4a5870;font-size:10px}.settings-aba-imported-item small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .aba-comparison-head{min-width:126px!important;width:126px!important;padding:0 7px!important;line-height:1.3!important;white-space:normal!important}
      .aba-comparison-cell{min-width:126px!important;width:126px!important;font-weight:800;white-space:nowrap}
      .aba-comparison-cell.aba-trend-up{color:#c84d56;background:#fff4f2}
      .aba-comparison-cell.aba-trend-down{color:#23845c;background:#f1fbf5}
      .aba-comparison-cell.aba-trend-same{color:#6d7787;background:#f4f6f8}
      .aba-comparison-cell.aba-trend-none{color:#9aa4b1;background:#fafbfc}
      .aba-comparison-note{display:block;margin-top:2px;color:inherit;font-size:9px;font-weight:600;opacity:.78}
      /* Keep sticky keyword cells below the three sticky ABA header rows so
         scrolled body keywords cannot paint over the header. */
      .aba-table tbody .aba-keyword-cell{z-index:3!important}
      .aba-table thead .keyword-col{z-index:8!important}
      /* Matrix ranks are numeric values, so keep them flush to the right edge
         of each date column in both the natural and SP matrices. */
      .matrix-table td.matrix-annotation-cell{text-align:right!important}
      .matrix-table td.matrix-annotation-cell .sp-rank-value{display:block;text-align:right}
      .matrix-table td.matrix-annotation-cell .cell-annotation-input{text-align:right}
      .settings-competitor-panel{margin:14px 0 12px;padding:14px;border:1px solid #b9dfe6;border-radius:11px;background:linear-gradient(135deg,#f5fdff,#fbffff)}
      .settings-competitor-title{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;color:#245b68;font-size:13px;font-weight:800}
      .settings-competitor-title small{color:#66818a;font-size:10px;font-weight:600}
      .settings-competitor-help{display:block;margin:0 0 10px;color:#647786;font-size:10px;line-height:1.55}
      .settings-competitor-fields{display:grid;grid-template-columns:1.2fr 1fr 1fr 1fr;gap:8px;margin-bottom:9px}
      .settings-competitor-fields label{display:flex;min-width:0;flex-direction:column;gap:4px;color:#52617b;font-size:10px;font-weight:700}
      .settings-competitor-fields input,.settings-competitor-fields select{box-sizing:border-box;width:100%;height:31px;border:1px solid #9fc5cc;border-radius:7px;background:#fff;padding:0 7px;color:#25354d;font:700 11px Inter,"Microsoft YaHei",sans-serif;outline:0}
      .settings-competitor-fields input:focus,.settings-competitor-fields select:focus{border-color:#27c7d9;box-shadow:0 0 0 3px #27c7d921}
      .settings-competitor-add{width:100%;height:34px;border:1px solid #178b9a;border-radius:8px;background:#27c7d9;color:#173b64;font:800 12px Inter,"Microsoft YaHei",sans-serif;cursor:pointer}
      .settings-competitor-add:hover:not(:disabled){background:#13b6c9;transform:translateY(-1px)}
      .settings-competitor-add:disabled{cursor:wait;opacity:.6}
      .settings-competitor-status{display:block;min-height:15px;margin-top:7px;color:#3d6f74;font-size:10px;line-height:1.45;white-space:pre-wrap}
      .settings-competitor-status.is-error{color:#b43b3b}
      .settings-competitor-list{display:grid;gap:5px;margin-top:10px;padding-top:9px;border-top:1px solid #d8edf0;max-height:190px;overflow:auto}
      .settings-competitor-item{display:flex;align-items:center;gap:8px;padding:7px 8px;border:1px solid #d7e9ec;border-radius:8px;background:#fff;color:#52617b;font-size:10px;line-height:1.35}
      .settings-competitor-item-main{display:flex;min-width:0;flex:1;flex-direction:column;gap:2px}.settings-competitor-item-main strong{color:#245b68;font-size:11px}.settings-competitor-item-main small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .settings-competitor-remove{flex:0 0 auto;height:25px;border:1px solid #d47b7b;border-radius:6px;background:#fff7f5;color:#b43b3b;padding:0 7px;font:800 10px Inter,"Microsoft YaHei",sans-serif;cursor:pointer}.settings-competitor-remove:hover{background:#ffe8e3}
      /* The product-row toggle owns a real 28x28 flex slot.  It never sits on
         top of the name/ASIN copy, even when the copy is long. */
      .dropdown-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:0;border-radius:50%;background:transparent;flex:0 0 28px;margin:0 0 0 2px;padding:0;color:inherit;font:900 17px/1 Inter,"Microsoft YaHei",sans-serif;cursor:pointer;transition:background .16s ease,transform .16s ease}
      .dropdown-btn:hover{background:rgba(255,255,255,.10)}
      .dropdown-btn[aria-expanded="true"]{transform:rotate(180deg)}
      .dropdown-btn:focus-visible,.competitor-keyword-button:focus-visible{outline:3px solid #27c7d966;outline-offset:1px}
      .model-item{position:relative;display:flex;align-items:center;min-width:0}.model-item .model-copy{min-width:0;flex:1;overflow:hidden}.model-item .model-copy strong,.model-item .model-copy small{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .model-item[${COMPETITOR_TOP_LEVEL_ATTR}="true"]{display:none!important}
      .competitor-sidebar-list{display:flex;flex-direction:column;gap:3px;margin:-3px 0 1px;padding:0 0 1px 20px;border-left:1px solid rgba(255,255,255,.20)}
      .competitor-sidebar-list[hidden]{display:none}
      .competitor-sidebar-item{display:flex;align-items:center;min-width:0;min-height:43px;gap:6px;padding:6px 7px 6px 9px;border-radius:9px;color:rgba(255,255,255,.84);background:rgba(255,255,255,.035)}
      .competitor-sidebar-item:hover{background:rgba(255,255,255,.10)}
      .competitor-sidebar-item.is-selected{background:var(--cyan);color:#133149;box-shadow:inset 0 0 0 2px #ffffff29}
      .competitor-sidebar-branch{flex:0 0 auto;color:rgba(255,255,255,.48);font-size:12px;line-height:1}
      .competitor-sidebar-item.is-selected .competitor-sidebar-branch{color:#236477}
      .competitor-sidebar-copy{display:flex;min-width:0;flex:1;flex-direction:column;align-items:flex-start;gap:2px;border:0;background:transparent;color:inherit;padding:0;text-align:left;cursor:pointer}
      .competitor-sidebar-copy strong,.competitor-sidebar-copy small{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .competitor-sidebar-copy strong{font-size:12px;line-height:1.2}.competitor-sidebar-copy small{font-size:10px;opacity:.8}
      .competitor-sidebar-badge{flex:0 0 auto;padding:2px 5px;border:1px solid rgba(255,255,255,.26);border-radius:999px;color:rgba(255,255,255,.74);font-size:9px;font-weight:800;line-height:1.1}
      .competitor-sidebar-item.is-selected .competitor-sidebar-badge{border-color:#247a8a;color:#1f6070;background:rgba(255,255,255,.45)}
      .competitor-sidebar-empty{padding:8px 8px 8px 13px;color:rgba(255,255,255,.54);font-size:10px}
      .settings-delete-item[${COMPETITOR_TOP_LEVEL_ATTR}="true"]{display:none!important}
      .competitor-keyword-cell{position:relative}.competitor-keyword-cell .competitor-keyword-label{display:inline-block;max-width:calc(100% - 45px);overflow:hidden;text-overflow:ellipsis;vertical-align:middle}
      .competitor-keyword-button{display:inline-flex;align-items:center;justify-content:center;height:23px;margin-left:7px;border:1px solid #8ecbd4;border-radius:6px;background:#effcff;color:#217080;padding:0 7px;font:800 10px Inter,"Microsoft YaHei",sans-serif;cursor:pointer;vertical-align:middle;white-space:nowrap}.competitor-keyword-button:hover{background:#d6f7fb}
      .competitor-drawer-overlay{position:fixed;inset:0;z-index:100000;background:rgba(20,47,77,.26);opacity:0;pointer-events:none;transition:opacity .2s ease;font-family:Inter,"Microsoft YaHei",sans-serif}.competitor-drawer-overlay.is-open{opacity:1;pointer-events:auto}
      .competitor-drawer{position:absolute;top:0;right:0;display:flex;box-sizing:border-box;width:min(820px,calc(100vw - 18px));height:100%;flex-direction:column;background:#f8fbfd;box-shadow:-20px 0 55px rgba(20,47,77,.24);transform:translateX(100%);transition:transform .24s ease}.competitor-drawer-overlay.is-open .competitor-drawer{transform:translateX(0)}
      .competitor-drawer-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px 24px 15px;border-bottom:1px solid #d9e8ee;background:#fff}.competitor-drawer-heading{min-width:0}.competitor-drawer-heading h2{margin:0;color:#173b64;font-size:20px;line-height:1.25}.competitor-drawer-heading p{margin:5px 0 0;color:#678097;font-size:11px;line-height:1.45}.competitor-drawer-close{flex:0 0 auto;width:34px;height:34px;border:1px solid #b8d9df;border-radius:9px;background:#f4fcfe;color:#245b68;font-size:23px;line-height:1;cursor:pointer}.competitor-drawer-close:hover{background:#dff7fa}
      .competitor-drawer-body{flex:1;min-height:0;padding:17px 20px 24px;overflow:auto}.competitor-drawer-note{margin:0 0 12px;padding:9px 11px;border-left:3px solid #27c7d9;border-radius:5px;background:#edfafd;color:#4d6b7d;font-size:11px;line-height:1.5}.competitor-drawer-empty{display:grid;place-items:center;min-height:180px;padding:20px;border:1px dashed #a7ced6;border-radius:12px;background:#fff;color:#69808f;text-align:center;font-size:12px;line-height:1.6}.competitor-drawer-empty button{margin-top:11px;height:31px;border:1px solid #178b9a;border-radius:7px;background:#27c7d9;color:#173b64;padding:0 12px;font:800 11px Inter,"Microsoft YaHei",sans-serif;cursor:pointer}
      .competitor-owner-card,.competitor-product-card{margin-bottom:14px;border:1px solid #d8e7ed;border-radius:12px;background:#fff;box-shadow:0 4px 16px rgba(31,73,101,.06)}.competitor-owner-card{padding:13px 15px}.competitor-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:9px;padding:13px 15px 9px;border-bottom:1px solid #edf1f4}.competitor-card-title{min-width:0}.competitor-card-title strong{display:block;color:#173b64;font-size:14px}.competitor-card-title small{display:block;margin-top:3px;color:#74879a;font-size:10px}.competitor-card-badge{flex:0 0 auto;padding:4px 7px;border-radius:999px;background:#e9f8fb;color:#237281;font-size:10px;font-weight:800}.competitor-owner-meta{display:flex;flex-wrap:wrap;gap:7px 15px;color:#5d7282;font-size:11px}.competitor-owner-meta b{color:#245b68}.competitor-card-actions{display:flex;align-items:center;gap:7px}.competitor-refresh-button{height:27px;border:1px solid #8ecbd4;border-radius:6px;background:#effcff;color:#217080;padding:0 8px;font:800 10px Inter,"Microsoft YaHei",sans-serif;cursor:pointer}.competitor-refresh-button:disabled{opacity:.55;cursor:wait}
      .competitor-table-wrap{max-height:440px;overflow:auto}.competitor-table{width:100%;min-width:700px;border-collapse:separate;border-spacing:0;font-size:10px}.competitor-table th{position:sticky;top:0;z-index:2;padding:8px 7px;border-bottom:1px solid #cddfe6;background:#f2f8fa;color:#5f7385;font-weight:800;text-align:left;white-space:nowrap}.competitor-table td{padding:7px;border-bottom:1px solid #edf1f4;color:#344c60;white-space:nowrap}.competitor-table tbody tr:last-child td{border-bottom:0}.competitor-table .number{text-align:right;font-variant-numeric:tabular-nums}.competitor-table .keyword{max-width:210px;overflow:hidden;text-overflow:ellipsis}.competitor-table .status-missing{color:#b47a35}.competitor-table .self-row td{background:#f3fbfd;color:#173b64;font-weight:700}.competitor-table .highlight-rank{color:#18798a;font-weight:900}.competitor-compare-table{min-width:760px}.competitor-compare-table td:first-child,.competitor-compare-table th:first-child{position:sticky;left:0;z-index:1;background:#f8fbfd}.competitor-compare-table .self-row td:first-child{background:#f3fbfd}.competitor-compare-table th:first-child{z-index:3}.competitor-compare-section{margin-bottom:14px;border:1px solid #d8e7ed;border-radius:12px;background:#fff;box-shadow:0 4px 16px rgba(31,73,101,.06)}.competitor-compare-section .competitor-card-head{border-bottom:1px solid #edf1f4}.competitor-no-data{color:#9aa7b2!important;font-style:italic}.competitor-drawer-loading{display:grid;place-items:center;min-height:180px;color:#66818a;font-size:12px}
      .matrix-competitor-bubble{position:fixed;z-index:120;width:min(320px,calc(100vw - 20px));max-height:min(290px,calc(100vh - 20px));overflow:auto;padding:10px 11px 11px;border:1.5px solid var(--navy);border-radius:11px;background:#fff;box-shadow:0 10px 24px rgba(23,59,100,.22);color:#25354d;pointer-events:none;font-family:Inter,"Microsoft YaHei",sans-serif}
      .matrix-competitor-bubble:after{content:"";position:absolute;width:12px;height:12px;background:#fff;border-right:1.5px solid var(--navy);border-bottom:1.5px solid var(--navy);transform:rotate(45deg);top:calc(50% - 6px);left:-7px}
      .matrix-competitor-bubble.is-left:after{left:auto;right:-7px;transform:rotate(225deg)}
      .matrix-competitor-bubble.is-above:after{top:auto;bottom:-7px;left:calc(50% - 6px);right:auto;transform:rotate(45deg)}
      .matrix-competitor-bubble.is-above.is-left:after{left:calc(50% - 6px);right:auto;transform:rotate(45deg)}
      .matrix-competitor-bubble.is-below:after{top:-7px;bottom:auto;left:calc(50% - 6px);right:auto;transform:rotate(225deg)}
      .matrix-competitor-bubble-title{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:7px;padding-bottom:6px;border-bottom:1px solid #e4edf0}.matrix-competitor-bubble-title strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--navy);font-size:12px}.matrix-competitor-bubble-title small{flex:0 0 auto;color:#718092;font-size:9px}.matrix-competitor-bubble-grid{display:flex;flex-direction:column;gap:7px}.matrix-competitor-bubble-section{min-width:0}.matrix-competitor-bubble-section+ .matrix-competitor-bubble-section{padding:7px 0 0;border-top:1px solid #e4edf0}.matrix-competitor-bubble-section h4{margin:0 0 4px;color:#5e7184;font-size:10px;font-weight:800}.matrix-competitor-bubble-row{display:flex;align-items:center;justify-content:space-between;gap:7px;min-height:22px;color:#344c60;font-size:10px}.matrix-competitor-bubble-row span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.matrix-competitor-bubble-row b{flex:0 0 auto;color:#173b64;font-variant-numeric:tabular-nums}.matrix-competitor-bubble-row.self-rank b{color:#14798b}.matrix-competitor-bubble-annotation{margin-top:5px;padding:5px 6px;border-radius:6px;background:#f5f8fa;color:#657789;font-size:9px;line-height:1.4;white-space:pre-wrap;word-break:break-word}.matrix-competitor-bubble-empty{color:#9aa7b2;font-size:10px;font-style:italic;line-height:1.5}
      @media (max-width:1180px){.header-actions{flex-wrap:wrap}.sif-all-import-status{flex-basis:100%;max-width:none;text-align:right}}
      @media (max-width:620px){.settings-aba-import-fields{grid-template-columns:1fr 1fr}.settings-aba-import-fields label:last-child{grid-column:1/-1}.settings-competitor-fields{grid-template-columns:1fr 1fr}.settings-competitor-fields label:first-child{grid-column:1/-1}}
      @media (max-width:520px){.settings-asin-editor-row{align-items:stretch;flex-direction:column}.settings-asin-save{width:100%}.settings-aba-import-fields{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function setStatus(editor, message, isError) {
    const status = editor.querySelector('.settings-asin-status');
    if (!status) return;
    status.textContent = message || '';
    status.classList.toggle('is-error', Boolean(isError));
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[character]));
  }

  function modelDetails(item) {
    const name = item.querySelector('.settings-product-copy strong')?.textContent.trim() || '';
    const oldAsin = item.querySelector('.settings-product-copy small')?.textContent.trim().toUpperCase() || '';
    return { name, oldAsin };
  }

  function installEditor(item) {
    if (!(item instanceof HTMLElement) || item.querySelector(`[${EDITOR_ATTR}]`)) return;
    const { name, oldAsin } = modelDetails(item);
    if (!name || !ASIN_PATTERN.test(oldAsin)) return;
    const competitorAsins = new Set(competitorModelsFromData(sidebarDataCache).flatMap((competitor) => [
      competitor?.parentAsin,
      ...(competitor?.legacyParentAsins || []),
    ].map(normalizedAsin)));
    if (competitorAsins.has(oldAsin)) return;

    const editor = document.createElement('div');
    editor.className = 'settings-asin-editor';
    editor.setAttribute(EDITOR_ATTR, '');
    editor.innerHTML = `
      <span class="settings-asin-editor-title">修改父体 ASIN</span>
      <div class="settings-asin-editor-row">
        <input type="text" value="${escapeHtml(oldAsin)}" maxlength="10" aria-label="${escapeHtml(name)}新的父体 ASIN" spellcheck="false" />
        <button type="button" class="settings-asin-save">保存 ASIN</button>
      </div>
      <small class="settings-asin-help">修改后原有历史、关注词和标注都会保留，旧 ASIN 报表仍可匹配。</small>
      <small class="settings-asin-status" role="status" aria-live="polite"></small>
    `;

    const input = editor.querySelector('input');
    const save = editor.querySelector('.settings-asin-save');
    const submit = async () => {
      const nextAsin = String(input.value || '').trim().toUpperCase();
      input.value = nextAsin;
      input.removeAttribute('aria-invalid');
      if (!ASIN_PATTERN.test(nextAsin)) {
        input.setAttribute('aria-invalid', 'true');
        setStatus(editor, '请输入格式为 B0XXXXXXXX 的 10 位父体 ASIN。', true);
        input.focus();
        return;
      }
      if (nextAsin === oldAsin) {
        setStatus(editor, '新旧 ASIN 相同，无需修改。');
        return;
      }
      const bridge = window.keywordTracker;
      if (!bridge || typeof bridge.changeModelAsin !== 'function') {
        setStatus(editor, '当前网页未加载 ASIN 修改功能，请刷新后重试。', true);
        return;
      }
      save.disabled = true;
      input.disabled = true;
      setStatus(editor, '正在保存，历史数据不会被删除……');
      try {
        const response = await bridge.changeModelAsin({
          modelName: name,
          oldParentAsin: oldAsin,
          newParentAsin: nextAsin,
        });
        const message = response && response.output
          ? String(response.output)
          : `已将父体 ASIN 修改为 ${nextAsin}，历史数据已保留。`;
        setStatus(editor, `${message} 页面即将刷新。`);
        window.setTimeout(() => window.location.reload(), 700);
      } catch (error) {
        save.disabled = false;
        input.disabled = false;
        setStatus(editor, error && error.message ? error.message : '保存失败，请重试。', true);
      }
    };

    input.addEventListener('input', () => {
      input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      input.removeAttribute('aria-invalid');
      setStatus(editor, '');
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      }
    });
    save.addEventListener('click', submit);

    const country = item.querySelector('.settings-country-control');
    const actions = item.querySelector('.settings-delete-actions');
    (country || actions || item.lastElementChild)?.before(editor);
  }

  function keywordKey(value) {
    return String(value == null ? '' : value).trim().toLocaleLowerCase('en-US');
  }

  function ownModelsFromData(data) {
    if (Array.isArray(data?.ownModels)) return data.ownModels;
    return (Array.isArray(data?.models) ? data.models : []).filter((model) => model?.kind !== 'competitor');
  }

  function competitorModelsFromData(data) {
    if (Array.isArray(data?.competitors)) return data.competitors;
    return (Array.isArray(data?.models) ? data.models : []).filter((model) => model?.kind === 'competitor');
  }

  function normalizedAsin(value) {
    return String(value || '').trim().toUpperCase();
  }

  function getCurrentAsin() {
    return normalizedAsin(document.querySelector('.topbar p')?.textContent?.match(/B0[A-Z0-9]{8}/i)?.[0] || '');
  }

  function modelForAsin(data, asin) {
    const wanted = normalizedAsin(asin);
    if (!wanted) return null;
    return (Array.isArray(data?.models) ? data.models : []).find((model) =>
      normalizedAsin(model?.parentAsin) === wanted
      || (model?.legacyParentAsins || []).map(normalizedAsin).includes(wanted)) || null;
  }

  function resolveOwnerAsin(data, asin) {
    const wanted = normalizedAsin(asin);
    const own = ownModelsFromData(data).find((model) =>
      normalizedAsin(model?.parentAsin) === wanted
      || (model?.legacyParentAsins || []).map(normalizedAsin).includes(wanted));
    if (own) return normalizedAsin(own.parentAsin);
    const competitor = competitorModelsFromData(data).find((model) =>
      normalizedAsin(model?.parentAsin) === wanted
      || (model?.legacyParentAsins || []).map(normalizedAsin).includes(wanted));
    return normalizedAsin(competitor?.ownerParentAsin || wanted);
  }

  function ownerModelForAsin(data, asin) {
    const ownerAsin = resolveOwnerAsin(data, asin);
    return ownModelsFromData(data).find((model) => normalizedAsin(model?.parentAsin) === ownerAsin)
      || modelForAsin(data, ownerAsin)
      || ownModelsFromData(data)[0]
      || null;
  }

  function dataForEnhancements(force = false) {
    const api = window.keywordTracker;
    if (!api || typeof api.getData !== 'function') return Promise.resolve(null);
    if (!force && sidebarDataCache) return Promise.resolve(sidebarDataCache);
    if (!force && sidebarDataPromise) return sidebarDataPromise;
    sidebarDataPromise = Promise.resolve(api.getData())
      .then((data) => { sidebarDataCache = data; return data; })
      .catch((error) => { console.warn('读取竞品导航数据失败。', error); return null; })
      .finally(() => { sidebarDataPromise = null; });
    return sidebarDataPromise;
  }

  function matrixDataForEnhancements(force = false) {
    const api = window.keywordTracker;
    if (!api || typeof api.getData !== 'function') return Promise.resolve(null);
    if (!force && matrixDataCache) return Promise.resolve(matrixDataCache);
    if (!force && matrixDataPromise) return matrixDataPromise;
    matrixDataPromise = Promise.resolve(api.getData())
      .then((data) => { matrixDataCache = data; return data; })
      .catch((error) => { console.warn('读取竞品矩阵数据失败。', error); return null; })
      .finally(() => { matrixDataPromise = null; });
    return matrixDataPromise;
  }

  function activeModel(data) {
    const asin = getCurrentAsin();
    return modelForAsin(data, asin) || data?.models?.[0] || null;
  }

  function renderAbaImportList(section, data) {
    const list = section.querySelector('.settings-aba-imported-list');
    if (!list) return;
    section._abaImports = Array.isArray(data?.abaMonthlyImports) ? data.abaMonthlyImports : [];
    list.textContent = '';
    const imports = section._abaImports;
    if (!imports.length) {
      const empty = document.createElement('small');
      empty.textContent = '尚未导入去年月 ABA 文件。';
      empty.className = 'settings-aba-imported-item';
      list.appendChild(empty);
      return;
    }
    imports.forEach((item) => {
      const line = document.createElement('div');
      line.className = 'settings-aba-imported-item';
      const title = document.createElement('strong');
      title.textContent = `${item.countryName || item.countryCode || '加拿大站'} ${item.month}`;
      const detail = document.createElement('small');
      detail.textContent = `${Number(item.rowCount || 0).toLocaleString('zh-CN')} 词${item.fileName ? ` · ${item.fileName}` : ''}`;
      detail.title = item.fileName || '';
      line.append(title, detail);
      list.appendChild(line);
    });
  }

  function installAbaImport() {
    const modal = document.querySelector('.settings-modal');
    // The React source now owns the same import section in both Electron and
    // the web build.  Keep this enhancer as a compatibility fallback for an
    // older bundle, but never inject a second section into the new UI.
    if (!modal || modal.querySelector(`[${ABA_IMPORT_ATTR}]`) || modal.querySelector('.settings-aba-import')) return;
    const section = document.createElement('section');
    section.className = 'settings-aba-import';
    section.setAttribute(ABA_IMPORT_ATTR, '');
    const year = new Date().getFullYear() - 1;
    const month = new Date().getMonth() + 1;
    section.innerHTML = `
      <div class="settings-aba-import-title"><span>月 ABA CSV 导入</span><small>今年/去年均可 · 搜索词 = 关键词</small></div>
      <p class="settings-aba-import-help">按国家、年份、月份导入月度 ABA CSV。看板和 ABA 月榜的月度排名、对照折线都以 CSV 为准；同一国家和月份再次导入会覆盖旧文件。</p>
      <div class="settings-aba-import-fields">
        <label>国家<select data-aba-country>${ABA_COUNTRIES.map((item) => `<option value="${item.code}">${item.label}</option>`).join('')}</select></label>
        <label>年份<input data-aba-year type="number" min="2000" max="2100" step="1" value="${year}" /></label>
        <label>月份<select data-aba-month>${Array.from({ length: 12 }, (_item, index) => `<option value="${index + 1}">${index + 1} 月</option>`).join('')}</select></label>
      </div>
      <label class="settings-aba-file">月 ABA CSV 文件<input data-aba-file type="file" accept=".csv,text/csv" /></label>
      <button type="button" class="settings-aba-import-button" data-aba-import-action>导入月 ABA 文件</button>
      <small class="settings-aba-import-status" data-aba-import-status role="status" aria-live="polite"></small>
      <div class="settings-aba-imported"><span class="settings-aba-imported-title">已导入月份</span><div class="settings-aba-imported-list"></div></div>
    `;
    const countryInput = section.querySelector('[data-aba-country]');
    const yearInput = section.querySelector('[data-aba-year]');
    const monthInput = section.querySelector('[data-aba-month]');
    const fileInput = section.querySelector('[data-aba-file]');
    const button = section.querySelector('[data-aba-import-action]');
    const status = section.querySelector('[data-aba-import-status]');
    const setAbaStatus = (message, isError = false) => {
      status.textContent = message || '';
      status.classList.toggle('is-error', Boolean(isError));
    };
    const refresh = async () => {
      const api = window.keywordTracker;
      if (!api || typeof api.getData !== 'function') return null;
      try {
        const data = await api.getData();
        const model = activeModel(data);
        if (model?.countryCode && !countryInput.dataset.userChanged) countryInput.value = model.countryCode;
        renderAbaImportList(section, data);
        return data;
      } catch (error) {
        setAbaStatus(error?.message || '读取已导入月份失败。', true);
        return null;
      }
    };
    countryInput.addEventListener('change', () => { countryInput.dataset.userChanged = 'true'; });
    monthInput.value = String(month);
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      const file = fileInput.files?.[0];
      const selectedYear = Number(yearInput.value);
      const selectedMonth = Number(monthInput.value);
      if (!file) { setAbaStatus('请先选择月 ABA CSV 文件。', true); fileInput.focus(); return; }
      if (!Number.isInteger(selectedYear) || selectedYear < 2000 || selectedYear > 2100) { setAbaStatus('年份应为 2000 至 2100 的整数。', true); yearInput.focus(); return; }
      const monthKey = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
      const existing = (section._abaImports || []).some((item) =>
        item.month === monthKey && String(item.countryCode || '').toUpperCase() === String(countryInput.value || '').toUpperCase());
      // The confirmation is deliberately explicit because replacing a month
      // changes both comparison columns for every matching keyword.
      if (existing && !window.confirm(`已存在 ${monthKey} 的月 ABA 数据，确定覆盖吗？`)) return;
      const api = window.keywordTracker;
      if (!api || typeof api.importAbaMonthlyCsv !== 'function') { setAbaStatus('当前网页未加载月 ABA 导入功能，请刷新后重试。', true); return; }
      button.disabled = true;
      setAbaStatus(`正在解析 ${file.name}，大文件可能需要一点时间……`);
      try {
        const response = await api.importAbaMonthlyCsv({
          countryCode: countryInput.value,
          year: selectedYear,
          month: selectedMonth,
          file,
          replace: true,
        });
        setAbaStatus(response?.output || `${monthKey} 月 ABA 已导入。`);
        fileInput.value = '';
        await refresh();
      } catch (error) {
        setAbaStatus(error?.message || '月 ABA 导入失败，请检查文件和月份。', true);
      } finally {
        button.disabled = false;
      }
    });
    const resetButton = modal.querySelector('.settings-reset-button');
    (resetButton || modal.querySelector('.drawer-header'))?.after(section);
    refresh();
  }

  function comparisonLabel(direction) {
    return ({ up: '上升', down: '下降', same: '持平', none: '—' })[direction] || '—';
  }

  function comparisonTitle(row, kind) {
    if (kind === 'yoy') {
      const median = row.abaCurrentMedian == null ? '—' : Number(row.abaCurrentMedian).toLocaleString('zh-CN');
      const previous = row.abaPreviousYearRank == null ? '—' : Number(row.abaPreviousYearRank).toLocaleString('zh-CN');
      return `${row.abaCurrentMonth || '本月'}周ABA中位数：${median}；${row.abaPreviousYearMonth || '去年同月'}：${previous}。数字越小越好。`;
    }
    const previous = row.abaPreviousYearRank == null ? '—' : Number(row.abaPreviousYearRank).toLocaleString('zh-CN');
    const next = row.abaPreviousYearNextRank == null ? '—' : Number(row.abaPreviousYearNextRank).toLocaleString('zh-CN');
    return `${row.abaPreviousYearMonth || '去年同月'}：${previous}；下一个月：${next}。数字越小越好。`;
  }

  function applyComparisonCell(cell, row, kind) {
    const direction = kind === 'yoy' ? row?.abaYoYTrend : row?.abaPreviousYearMoMTrend;
    const label = comparisonLabel(direction);
    cell.className = `aba-comparison-cell aba-trend-${direction || 'none'}`;
    cell.textContent = label;
    cell.title = comparisonTitle(row || {}, kind);
    cell.setAttribute('aria-label', `${kind === 'yoy' ? 'ABA排名同比趋势' : '去年ABA排名环比趋势'}：${label}`);
  }

  async function enhanceAbaTable(table) {
    if (!(table instanceof HTMLTableElement) || !table.classList.contains('aba-table')) return;
    if (table.dataset.abaComparisonColumns === 'pending') return;
    if (table.dataset.abaComparisonColumns === 'ready') {
      const needsRows = [...table.querySelectorAll('tbody tr')].some((row) =>
        !row.querySelector('[data-aba-comparison-cell="yoy"]')
        || !row.querySelector('[data-aba-comparison-cell="previous-year-mom"]'));
      if (!needsRows) return;
      delete table.dataset.abaComparisonColumns;
    }
    table.dataset.abaComparisonColumns = 'pending';
    const api = window.keywordTracker;
    if (!api || typeof api.getData !== 'function') { delete table.dataset.abaComparisonColumns; return; }
    let data;
    try { data = await api.getData(); } catch (error) { delete table.dataset.abaComparisonColumns; return; }
    const model = activeModel(data);
    const rowsByKeyword = new Map((model?.abaRows || []).map((row) => [keywordKey(row.keyword), row]));
    const colgroup = table.querySelector('colgroup');
    if (colgroup) {
      ['yoy', 'previous-year-mom'].forEach((key) => {
        if (colgroup.querySelector(`[data-aba-comparison-col="${key}"]`)) return;
        const col = document.createElement('col');
        col.dataset.abaComparisonCol = key;
        col.style.width = '126px';
        col.style.minWidth = '126px';
        // Keep the two comparison fields beside the fixed keyword columns so
        // they remain easy to find before the twelve month columns.
        colgroup.children[3] ? colgroup.children[3].before(col) : colgroup.appendChild(col);
      });
    }
    const firstHeader = table.querySelector('thead tr.matrix-year-row');
    if (firstHeader) {
      const spacer = firstHeader.querySelector('.aba-meta-spacer');
      [
        ['yoy', 'ABA排名同比趋势'],
        ['previous-year-mom', '去年ABA排名环比趋势'],
      ].forEach(([key, label]) => {
        let head = firstHeader.querySelector(`[data-aba-comparison-head="${key}"]`);
        if (!head) {
          head = document.createElement('th');
          head.dataset.abaComparisonHead = key;
          head.className = 'aba-comparison-head';
          head.rowSpan = 3;
          head.textContent = label;
        }
        if (spacer) spacer.before(head); else firstHeader.appendChild(head);
      });
    }
    table.setAttribute(ABA_TABLE_ATTR, '');
    table.querySelectorAll('tbody tr').forEach((bodyRow) => {
      const keyword = bodyRow.querySelector('.aba-keyword-cell')?.textContent || '';
      const row = rowsByKeyword.get(keywordKey(keyword));
      [['yoy', 'yoy'], ['previous-year-mom', 'mom']].forEach(([key, kind]) => {
        let cell = bodyRow.querySelector(`[data-aba-comparison-cell="${key}"]`);
        if (!cell) {
          cell = document.createElement('td');
          cell.dataset.abaComparisonCell = key;
        }
        const searchCell = [...bodyRow.children].find((candidate, index) =>
          index >= 3 && !candidate.hasAttribute('data-aba-comparison-cell'));
        if (searchCell && searchCell !== cell) searchCell.before(cell); else bodyRow.appendChild(cell);
        applyComparisonCell(cell, row, kind);
      });
    });
    table.dataset.abaComparisonColumns = 'ready';
  }

  function scanAbaTables() {
    document.querySelectorAll('table.aba-table').forEach((table) => { enhanceAbaTable(table); });
  }

  // Matrix dates are rendered chronologically from left to right.  When a
  // matrix tab opens, move its horizontal scroller to the far right so the
  // latest date is immediately visible while the fixed keyword columns remain
  // pinned on the left.  The small retry loop waits for the table's columns to
  // finish layout without repeatedly overriding a user's later manual scroll.
  const matrixScrollJobs = new WeakMap();
  function alignMatrixToLatestDate(table) {
    if (!(table instanceof HTMLTableElement)
      || !table.classList.contains('matrix-table')
      || table.classList.contains('aba-table')
      || table.hasAttribute(MATRIX_LATEST_SCROLL_ATTR)) return;
    const scroll = table.closest('.matrix-scroll');
    if (!(scroll instanceof HTMLElement) || matrixScrollJobs.has(table)) return;
    const job = { attempts: 0 };
    matrixScrollJobs.set(table, job);
    const run = () => {
      if (!table.isConnected) { matrixScrollJobs.delete(table); return; }
      const hasRows = table.querySelector('tbody tr');
      const hasDateHeaders = table.querySelectorAll('thead tr:last-child th').length > 3;
      if (!scroll.clientWidth || !scroll.clientHeight || !hasRows || !hasDateHeaders) {
        if (job.attempts++ < 18) { window.requestAnimationFrame(run); return; }
        matrixScrollJobs.delete(table);
        return;
      }
      const maxScrollLeft = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
      scroll.scrollLeft = maxScrollLeft;
      table.setAttribute(MATRIX_LATEST_SCROLL_ATTR, '');
      matrixScrollJobs.delete(table);
    };
    window.requestAnimationFrame(() => window.requestAnimationFrame(run));
  }

  function scanMatrices() {
    document.querySelectorAll('table.matrix-table.matrix-group-table:not(.aba-table)')
      .forEach((table) => {
        alignMatrixToLatestDate(table);
        installMatrixHover(table);
      });
  }

  function matrixShortDate(date) {
    const match = String(date || '').match(/^20\d{2}-(\d{2})-(\d{2})$/);
    return match ? `${Number(match[1])}/${Number(match[2])}` : '';
  }

  function matrixVisibleDates(table, model) {
    const dates = Array.isArray(model?.dates) ? model.dates : [];
    const headers = [...(table.querySelector('thead tr:last-child')?.querySelectorAll('th') || [])]
      .slice(3)
      .filter((header) => !header.classList.contains('matrix-placeholder-head'));
    const visible = [];
    let searchStart = 0;
    headers.forEach((header) => {
      const label = header.textContent.replace(/\s+/gu, '').trim();
      if (!label) return;
      let index = dates.findIndex((date, candidateIndex) => candidateIndex >= searchStart && matrixShortDate(date) === label);
      if (index < 0) index = dates.findIndex((date) => matrixShortDate(date) === label);
      if (index < 0) return;
      visible.push(dates[index]);
      searchStart = index + 1;
    });
    return visible;
  }

  function matrixCellDate(table, cell, model) {
    // Current MatrixView stamps the full ISO date on every rank cell. Keep the
    // header scan only as a compatibility fallback for older bundles.
    const stampedDate = cell?.getAttribute?.('data-matrix-date');
    if (stampedDate) return stampedDate;
    const row = cell?.closest('tr');
    if (!(row instanceof HTMLTableRowElement)) return '';
    const rankCells = [...row.querySelectorAll('td.matrix-annotation-cell')];
    const rankIndex = rankCells.indexOf(cell);
    if (rankIndex < 0) return '';
    return matrixVisibleDates(table, model)[rankIndex] || '';
  }

  function buildMatrixLookup(data) {
    if (matrixLookupCache?.data === data) return matrixLookupCache;
    const modelByAsin = new Map();
    const modelLookups = new Map();
    const competitorsByOwner = new Map();
    const models = Array.isArray(data?.models) ? data.models : [];
    models.forEach((model) => {
      const asin = normalizedAsin(model?.parentAsin);
      if (asin) modelByAsin.set(asin, model);
      (model?.legacyParentAsins || []).forEach((legacy) => {
        const normalized = normalizedAsin(legacy);
        if (normalized) modelByAsin.set(normalized, model);
      });
      const rowsByKeyword = new Map((model?.matrixRows || []).map((row) => [keywordKey(row.keyword), row]));
      const datesByValue = new Map((model?.dates || []).map((date, index) => [date, index]));
      const historyByKeywordDate = new Map();
      (model?.historyRecords || []).forEach((record) => {
        const itemKey = keywordKey(record.keyword);
        let dateMap = historyByKeywordDate.get(itemKey);
        if (!dateMap) { dateMap = new Map(); historyByKeywordDate.set(itemKey, dateMap); }
        // Preserve the first record for duplicate keyword/date entries, which
        // matches the old find() behaviour used by the comparison bubble.
        if (!dateMap.has(record.snapshotDate)) dateMap.set(record.snapshotDate, record);
      });
      modelLookups.set(model, { rowsByKeyword, datesByValue, historyByKeywordDate });
      if (model?.kind === 'competitor') {
        const owner = normalizedAsin(model.ownerParentAsin);
        const bucket = competitorsByOwner.get(owner) || [];
        bucket.push(model);
        competitorsByOwner.set(owner, bucket);
      }
    });
    competitorsByOwner.forEach((list) => list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    matrixLookupCache = { data, modelByAsin, modelLookups, competitorsByOwner };
    return matrixLookupCache;
  }

  function matrixRankAt(model, keyword, date, metric, lookup = buildMatrixLookup({ models: [model] })) {
    const modelLookup = lookup.modelLookups.get(model);
    const row = modelLookup?.rowsByKeyword.get(keywordKey(keyword))
      || (model?.matrixRows || []).find((item) => keywordKey(item.keyword) === keywordKey(keyword));
    const index = modelLookup?.datesByValue.get(date) ?? (model?.dates || []).indexOf(date);
    if (!row || index < 0) return { rank: null, annotation: '' };
    const values = metric === 'sp' ? row.spValues : row.naturalValues;
    const annotations = metric === 'sp' ? row.spAnnotations : row.naturalAnnotations;
    const rawRank = values?.[index];
    const rank = rawRank == null || Number(rawRank) <= 0 ? null : Number(rawRank);
    return { rank, annotation: annotations?.[index] || '' };
  }

  function matrixHistoryRank(model, keyword, date, metric, lookup = buildMatrixLookup({ models: [model] })) {
    const modelLookup = lookup.modelLookups.get(model);
    const record = modelLookup?.historyByKeywordDate.get(keywordKey(keyword))?.get(date)
      || (model?.historyRecords || []).find((item) => keywordKey(item.keyword) === keywordKey(keyword) && item.snapshotDate === date);
    const rawRank = metric === 'sp' ? record?.spRank : record?.naturalRank;
    return rawRank == null || Number(rawRank) <= 0 ? null : Number(rawRank);
  }

  function matrixRankLabel(rank) {
    return rank == null ? '未上榜' : `#${Number(rank).toLocaleString('zh-CN')}`;
  }

  function ensureMatrixBubble() {
    let bubble = document.getElementById(MATRIX_BUBBLE_ID);
    if (bubble) return bubble;
    bubble = document.createElement('div');
    bubble.id = MATRIX_BUBBLE_ID;
    bubble.className = 'matrix-competitor-bubble';
    bubble.setAttribute('role', 'tooltip');
    bubble.hidden = true;
    document.body.appendChild(bubble);
    return bubble;
  }

  function positionMatrixBubble(bubble, cell) {
    if (!bubble || !cell) return;
    bubble.hidden = false;
    bubble.classList.remove('is-left', 'is-above', 'is-below');
    const rect = cell.getBoundingClientRect();
    const width = Math.min(340, Math.max(220, bubble.offsetWidth || 320));
    const height = Math.min(window.innerHeight - 20, Math.max(110, bubble.offsetHeight || 220));
    const gap = 10;
    let left;
    let top;
    if (rect.right + gap + width <= window.innerWidth - 8) {
      left = rect.right + gap;
    } else if (rect.left - gap - width >= 8) {
      left = rect.left - gap - width;
      bubble.classList.add('is-left');
    } else if (rect.bottom + gap + height <= window.innerHeight - 8) {
      left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      top = rect.bottom + gap;
      bubble.classList.add('is-below');
    } else if (rect.top - gap - height >= 8) {
      left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      top = rect.top - gap - height;
      bubble.classList.add('is-above');
    } else {
      left = Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8));
    }
    if (top == null) {
      top = rect.top + rect.height / 2 - height / 2;
      if (top < 8) {
        top = rect.bottom + gap;
        bubble.classList.add('is-below');
      }
      if (top + height > window.innerHeight - 8) {
        top = rect.top - gap - height;
        bubble.classList.remove('is-below');
        bubble.classList.add('is-above');
      }
    }
    top = Math.max(8, Math.min(top, window.innerHeight - height - 8));
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    bubble.style.left = `${Math.round(left)}px`;
    bubble.style.top = `${Math.round(top)}px`;
  }

  function cancelMatrixBubbleHide() {
    if (matrixBubbleHideTimer == null) return;
    window.clearTimeout(matrixBubbleHideTimer);
    matrixBubbleHideTimer = null;
  }

  function cancelMatrixBubbleShow() {
    if (matrixBubbleShowTimer == null) return;
    window.clearTimeout(matrixBubbleShowTimer);
    matrixBubbleShowTimer = null;
  }

  function hideMatrixBubble() {
    cancelMatrixBubbleShow();
    cancelMatrixBubbleHide();
    matrixBubbleToken += 1;
    matrixBubbleAnchorCell = null;
    matrixBubbleAnchorTable = null;
    const bubble = document.getElementById(MATRIX_BUBBLE_ID);
    if (bubble) {
      bubble.hidden = true;
      delete bubble.dataset.anchor;
    }
  }

  function scheduleMatrixBubbleHide() {
    cancelMatrixBubbleHide();
    matrixBubbleHideTimer = window.setTimeout(() => {
      matrixBubbleHideTimer = null;
      hideMatrixBubble();
    }, MATRIX_BUBBLE_HIDE_DELAY);
  }

  function scheduleMatrixBubbleShow(table, cell) {
    cancelMatrixBubbleShow();
    cancelMatrixBubbleHide();
    const rank = Number(cell?.getAttribute('data-rank'));
    if (!Number.isFinite(rank) || rank <= 0) { hideMatrixBubble(); return; }
    matrixBubbleShowTimer = window.setTimeout(() => {
      matrixBubbleShowTimer = null;
      showMatrixBubble(table, cell);
    }, MATRIX_BUBBLE_SHOW_DELAY);
  }

  async function showMatrixBubble(table, cell) {
    cancelMatrixBubbleHide();
    const currentRank = Number(cell?.getAttribute('data-rank'));
    if (!Number.isFinite(currentRank) || currentRank <= 0) {
      hideMatrixBubble();
      return;
    }
    const bubble = ensureMatrixBubble();
    const token = ++matrixBubbleToken;
    const modelData = await matrixDataForEnhancements(false);
    if (token !== matrixBubbleToken || !cell.isConnected || !modelData) return;
    const lookup = buildMatrixLookup(modelData);
    const currentAsin = getCurrentAsin();
    const active = lookup.modelByAsin.get(currentAsin) || activeModel(modelData);
    const ownerAsin = active?.kind === 'competitor' ? active.ownerParentAsin : (active?.parentAsin || currentAsin);
    const owner = lookup.modelByAsin.get(normalizedAsin(ownerAsin)) || ownerModelForAsin(modelData, ownerAsin);
    if (!owner) return;
    const keyword = cell.closest('tr')?.querySelector('.keyword-col')?.getAttribute('title')
      || cell.closest('tr')?.querySelector('.keyword-col')?.textContent?.trim() || '';
    const metric = cell.classList.contains('sp-annotation-cell') ? 'sp' : 'natural';
    const date = matrixCellDate(table, cell, active || owner);
    if (!keyword || !date) return;
    const ownerRank = matrixRankAt(owner, keyword, date, metric, lookup);
    const competitors = lookup.competitorsByOwner.get(normalizedAsin(owner.parentAsin)) || ownerCompetitors(modelData, owner);
    const rows = competitors.map((competitor) => {
      const rank = matrixHistoryRank(competitor, keyword, date, metric, lookup);
      return `<div class="matrix-competitor-bubble-row"><span title="${escapeHtml(competitor.competitorName || competitor.modelName || '')}">${escapeHtml(competitor.competitorName || competitor.modelName || '竞品')}</span><b>${matrixRankLabel(rank)}</b></div>`;
    }).join('');
    const competitorContent = rows || '<div class="matrix-competitor-bubble-empty">暂无已关联竞品</div>';
    const annotation = ownerRank.annotation
      ? `<div class="matrix-competitor-bubble-annotation">标注：${escapeHtml(ownerRank.annotation)}</div>`
      : '<div class="matrix-competitor-bubble-annotation">暂无自有产品标注</div>';
    bubble.innerHTML = `<div class="matrix-competitor-bubble-title"><strong title="${escapeHtml(keyword)}">${escapeHtml(keyword)}</strong><small>${escapeHtml(date)} · ${metric === 'sp' ? 'SP排名' : '自然排名'}</small></div><div class="matrix-competitor-bubble-grid"><section class="matrix-competitor-bubble-section"><h4>竞品排名</h4>${competitorContent}</section><section class="matrix-competitor-bubble-section"><h4>自己产品信息</h4><div class="matrix-competitor-bubble-row self-rank"><span title="${escapeHtml(owner.modelName)}">${escapeHtml(owner.modelName)}</span><b>${matrixRankLabel(ownerRank.rank)}</b></div>${annotation}</section></div>`;
    bubble.hidden = false;
    matrixBubbleAnchorCell = cell;
    matrixBubbleAnchorTable = table;
    bubble.dataset.anchor = keyword;
    positionMatrixBubble(bubble, cell);
  }

  function installMatrixHover(table) {
    if (!(table instanceof HTMLTableElement)) return;
    table.setAttribute('data-competitor-matrix-hover-installed', '');
    if (table.hasAttribute(MATRIX_HOVER_DELEGATED_ATTR)) return;
    table.setAttribute(MATRIX_HOVER_DELEGATED_ATTR, '');
    table.querySelectorAll('tbody td.matrix-annotation-cell').forEach((cell) => {
      if (!(cell instanceof HTMLElement) || cell.hasAttribute(MATRIX_HOVER_ATTR)) return;
      cell.setAttribute(MATRIX_HOVER_ATTR, '');
      cell.tabIndex = 0;
    });
    const cellFromTarget = (target) => target?.closest?.('td.matrix-annotation-cell');
    table.addEventListener('pointerover', (event) => {
      const cell = cellFromTarget(event.target);
      if (!cell || !table.contains(cell) || cellFromTarget(event.relatedTarget) === cell) return;
      scheduleMatrixBubbleShow(table, cell);
    });
    table.addEventListener('pointermove', (event) => {
      const cell = cellFromTarget(event.target);
      const bubble = document.getElementById(MATRIX_BUBBLE_ID);
      if (cell && bubble && !bubble.hidden && bubble.dataset.anchor) positionMatrixBubble(bubble, cell);
    });
    table.addEventListener('pointerout', (event) => {
      const cell = cellFromTarget(event.target);
      if (!cell || cellFromTarget(event.relatedTarget) === cell) return;
      scheduleMatrixBubbleHide();
    });
    table.addEventListener('focusin', (event) => {
      const cell = cellFromTarget(event.target);
      if (cell) scheduleMatrixBubbleShow(table, cell);
    });
    table.addEventListener('focusout', (event) => {
      const cell = cellFromTarget(event.target);
      if (cell && cellFromTarget(event.relatedTarget) !== cell) scheduleMatrixBubbleHide();
    });
    const scroll = table.closest('.matrix-scroll');
    scroll?.addEventListener('scroll', () => {
      // A scroll can move the anchored cell away without generating a pointer
      // transition. Hide immediately; the next pointerover can open a fresh
      // bubble at the cell's new viewport position.
      if (matrixBubbleAnchorTable === table) hideMatrixBubble();
    }, { passive: true });
  }

  function countryOptions(selected = 'CA') {
    return ABA_COUNTRIES.map((item) => `<option value="${item.code}"${item.code === selected ? ' selected' : ''}>${item.label}</option>`).join('');
  }

  function competitorSettingsStatus(section, message, isError = false) {
    const node = section?.querySelector('[data-competitor-status]');
    if (!node) return;
    node.textContent = message || '';
    node.classList.toggle('is-error', Boolean(isError));
  }

  function syncCompetitorSettingsItems(data) {
    const competitorAsins = new Set();
    competitorModelsFromData(data).forEach((competitor) => {
      [competitor?.parentAsin, ...(competitor?.legacyParentAsins || [])]
        .map(normalizedAsin)
        .filter(Boolean)
        .forEach((asin) => competitorAsins.add(asin));
    });
    document.querySelectorAll('.settings-delete-item').forEach((item) => {
      const asin = normalizedAsin(item.querySelector('.settings-product-copy small')?.textContent);
      const isCompetitor = competitorAsins.has(asin);
      if (isCompetitor) item.setAttribute(COMPETITOR_TOP_LEVEL_ATTR, 'true');
      else item.removeAttribute(COMPETITOR_TOP_LEVEL_ATTR);
    });
  }

  function renderCompetitorSettings(section, data) {
    const ownerSelect = section.querySelector('[data-competitor-owner]');
    const countrySelect = section.querySelector('[data-competitor-country]');
    const list = section.querySelector('[data-competitor-list]');
    if (!ownerSelect || !list) return;
    const models = ownModelsFromData(data);
    const competitors = competitorModelsFromData(data);
    syncCompetitorSettingsItems(data);
    const previousOwner = ownerSelect.value;
    ownerSelect.innerHTML = models.map((model) => `<option value="${escapeHtml(model.parentAsin)}">${escapeHtml(model.modelName)}（${escapeHtml(model.parentAsin)}）</option>`).join('');
    if (models.some((model) => model.parentAsin === previousOwner)) ownerSelect.value = previousOwner;
    else if (models[0]) ownerSelect.value = models[0].parentAsin;
    const selectedOwner = models.find((model) => model.parentAsin === ownerSelect.value);
    if (countrySelect && !countrySelect.dataset.userChanged) countrySelect.value = selectedOwner?.countryCode || 'CA';
    list.textContent = '';
    if (!competitors.length) {
      const empty = document.createElement('small');
      empty.className = 'settings-competitor-item';
      empty.textContent = '尚未设置竞品。添加后，顶部“自动导入今日报表”和“本地导入”会按竞品 ASIN 自动匹配。';
      list.appendChild(empty);
      return;
    }
    competitors.forEach((competitor) => {
      const line = document.createElement('div');
      line.className = 'settings-competitor-item';
      line.innerHTML = `
        <div class="settings-competitor-item-main">
          <strong>${escapeHtml(competitor.competitorName || competitor.modelName || '未命名竞品')}</strong>
          <small>${escapeHtml(competitor.ownerModelName || competitor.ownerParentAsin || '')} · ${escapeHtml(competitor.parentAsin || '')} · ${escapeHtml(competitor.site || competitor.countryCode || '')}</small>
        </div>
        <button type="button" class="settings-competitor-remove" data-competitor-remove="${escapeHtml(competitor.competitorId || competitor.id || '')}">删除</button>`;
      list.appendChild(line);
    });
  }

  function installCompetitorSettings() {
    const modal = document.querySelector('.settings-modal');
    if (!modal || modal.querySelector(`[${COMPETITOR_SETTINGS_ATTR}]`)) return;
    const section = document.createElement('section');
    section.className = 'settings-competitor-panel';
    section.setAttribute(COMPETITOR_SETTINGS_ATTR, '');
    section.innerHTML = `
      <div class="settings-competitor-title"><span>竞品设置</span><small>按 ASIN 自动匹配报表</small></div>
      <p class="settings-competitor-help">为自己的产品添加一个或多个竞品。竞品使用与自有产品相同的 SIF/本地 Excel 导入方式，报表中的父体 ASIN 会自动归档到对应竞品；历史数据会持续保留。</p>
      <div class="settings-competitor-fields">
        <label>归属自己的产品<select data-competitor-owner></select></label>
        <label>竞品名称<input data-competitor-name type="text" maxlength="80" placeholder="例如 竞品 A" /></label>
        <label>竞品父体 ASIN<input data-competitor-asin type="text" maxlength="10" placeholder="B0XXXXXXXX" spellcheck="false" /></label>
        <label>国家<select data-competitor-country>${countryOptions('CA')}</select></label>
      </div>
      <button type="button" class="settings-competitor-add" data-competitor-add>添加竞品</button>
      <small class="settings-competitor-status" data-competitor-status role="status" aria-live="polite"></small>
      <div class="settings-competitor-list" data-competitor-list></div>`;
    const resetButton = modal.querySelector('.settings-reset-button');
    const abaSection = modal.querySelector('.settings-aba-import');
    if (abaSection) abaSection.after(section);
    else if (resetButton) resetButton.after(section);
    else modal.querySelector('.drawer-header')?.after(section);

    const api = window.keywordTracker;
    const ownerSelect = section.querySelector('[data-competitor-owner]');
    const nameInput = section.querySelector('[data-competitor-name]');
    const asinInput = section.querySelector('[data-competitor-asin]');
    const countrySelect = section.querySelector('[data-competitor-country]');
    const addButton = section.querySelector('[data-competitor-add]');
    const refresh = async () => {
      if (!api || typeof api.getData !== 'function') {
        competitorSettingsStatus(section, '当前网页未加载竞品设置功能，请刷新后重试。', true);
        return null;
      }
      try {
        const data = await api.getData();
        sidebarDataCache = data;
        renderCompetitorSettings(section, data);
        return data;
      } catch (error) {
        competitorSettingsStatus(section, error?.message || '读取竞品设置失败。', true);
        return null;
      }
    };
    ownerSelect.addEventListener('change', async () => {
      const data = await api?.getData?.();
      const model = ownModelsFromData(data).find((item) => item.parentAsin === ownerSelect.value);
      if (model && !countrySelect.dataset.userChanged) countrySelect.value = model.countryCode || 'CA';
    });
    countrySelect.addEventListener('change', () => { countrySelect.dataset.userChanged = 'true'; });
    asinInput.addEventListener('input', () => { asinInput.value = asinInput.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    addButton.addEventListener('click', async () => {
      const parentAsin = String(asinInput.value || '').trim().toUpperCase();
      const competitorName = String(nameInput.value || '').trim();
      if (!ownerSelect.value) { competitorSettingsStatus(section, '请先选择归属自己的产品。', true); return; }
      if (!competitorName) { competitorSettingsStatus(section, '请输入竞品名称。', true); nameInput.focus(); return; }
      if (!ASIN_PATTERN.test(parentAsin)) { competitorSettingsStatus(section, '请输入格式为 B0XXXXXXXX 的 10 位竞品父体 ASIN。', true); asinInput.focus(); return; }
      if (!api || typeof api.addCompetitor !== 'function') { competitorSettingsStatus(section, '当前网页未加载竞品保存功能，请刷新后重试。', true); return; }
      addButton.disabled = true;
      competitorSettingsStatus(section, '正在保存竞品配置……');
      try {
        const response = await api.addCompetitor({
          ownerParentAsin: ownerSelect.value,
          competitorName,
          parentAsin,
          countryCode: countrySelect.value,
        });
        nameInput.value = '';
        asinInput.value = '';
        competitorSettingsStatus(section, response?.output || '竞品已添加。');
        await refresh();
        window.dispatchEvent(new CustomEvent('keyword-tracker-competitor-updated'));
        // The production React tree owns the selected-model list and only
        // refreshes it after its own add-model callback.  Competitors are
        // stored by the browser bridge, so reload once after saving to let
        // React mount the same model-shaped row; the sidebar enhancer then
        // hides that top-level row and renders it under its parent product.
        window.setTimeout(() => window.location.reload(), 280);
      } catch (error) {
        competitorSettingsStatus(section, error?.message || '添加竞品失败，请重试。', true);
      } finally {
        addButton.disabled = false;
      }
    });
    section.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-competitor-remove]');
      if (!button) return;
      const competitorId = button.getAttribute('data-competitor-remove');
      const item = button.closest('.settings-competitor-item');
      const label = item?.querySelector('strong')?.textContent?.trim() || '该竞品';
      if (!window.confirm(`确定删除竞品“${label}”吗？其历史报表也会从浏览器本地数据中删除。`)) return;
      if (!api || typeof api.deleteCompetitor !== 'function') { competitorSettingsStatus(section, '当前网页未加载竞品删除功能，请刷新后重试。', true); return; }
      button.disabled = true;
      try {
        const response = await api.deleteCompetitor({ competitorId });
        competitorSettingsStatus(section, response?.output || '竞品已删除。');
        await refresh();
        window.dispatchEvent(new CustomEvent('keyword-tracker-competitor-updated'));
        // Likewise refresh after deletion so a removed competitor cannot stay
        // in the production model list until the next manual reload.
        window.setTimeout(() => window.location.reload(), 280);
      } catch (error) {
        button.disabled = false;
        competitorSettingsStatus(section, error?.message || '删除竞品失败，请重试。', true);
      }
    });
    section._refreshCompetitorSettings = refresh;
    refresh();
  }

  function ensureCompetitorDrawer() {
    let overlay = document.getElementById(COMPETITOR_DRAWER_ID);
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = COMPETITOR_DRAWER_ID;
    overlay.className = 'competitor-drawer-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <aside class="competitor-drawer" role="dialog" aria-modal="true" aria-labelledby="competitor-drawer-title">
        <header class="competitor-drawer-header">
          <div class="competitor-drawer-heading"><h2 id="competitor-drawer-title">竞品</h2><p data-competitor-drawer-subtitle></p></div>
          <button type="button" class="competitor-drawer-close" data-competitor-drawer-close aria-label="关闭竞品抽屉">×</button>
        </header>
        <div class="competitor-drawer-body" data-competitor-drawer-body></div>
      </aside>`;
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) closeCompetitorDrawer(); });
    overlay.querySelector('[data-competitor-drawer-close]').addEventListener('click', closeCompetitorDrawer);
    overlay.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeCompetitorDrawer(); });
    document.body.appendChild(overlay);
    return overlay;
  }

  function closeCompetitorDrawer() {
    const overlay = document.getElementById(COMPETITOR_DRAWER_ID);
    if (!overlay) return;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('competitor-drawer-open');
    document.querySelectorAll(`[${COMPETITOR_SIDEBAR_ATTR}]`).forEach((button) => button.setAttribute('aria-expanded', 'false'));
  }

  function numberText(value) {
    if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
    return Number(value).toLocaleString('zh-CN');
  }

  function rankText(value) {
    return value == null || value === '' ? '未上榜' : numberText(value);
  }

  function latestKeywordRecord(model, keyword, date = '') {
    const wanted = keywordKey(keyword);
    const records = (model?.historyRecords || []).filter((item) => keywordKey(item.keyword) === wanted);
    if (!records.length) return null;
    const exact = date ? records.filter((item) => item.snapshotDate === date) : [];
    const pool = exact.length ? exact : records;
    return [...pool].sort((a, b) => String(b.snapshotDate || '').localeCompare(String(a.snapshotDate || ''))
      || String(b.importTime || '').localeCompare(String(a.importTime || '')))[0] || null;
  }

  function modelKeywordRow(model, keyword, date = '') {
    const wanted = keywordKey(keyword);
    const dashboard = (model?.dashboardRows || []).find((item) => keywordKey(item.keyword) === wanted);
    const record = latestKeywordRecord(model, keyword, date);
    if (!dashboard && !record) return null;
    // Prefer the explicitly selected date's raw record when one exists.  The
    // dashboard row is a latest-date projection and would otherwise overwrite
    // a user's historical date selection in the comparison drawer.
    return { ...(dashboard || {}), ...(record || {}), snapshotDate: record?.snapshotDate || dashboard?.snapshotDate || date };
  }

  function ownerModelFromData(data, ownerAsin) {
    const normalized = resolveOwnerAsin(data, ownerAsin);
    return ownModelsFromData(data).find((model) => normalizedAsin(model.parentAsin) === normalized)
      || modelForAsin(data, normalized)
      || ownModelsFromData(data)[0]
      || null;
  }

  function ownerCompetitors(data, owner) {
    if (!owner) return [];
    const list = Array.isArray(data?.competitors) ? data.competitors : [];
    return list.filter((item) => String(item.ownerParentAsin || '').toUpperCase() === String(owner.parentAsin || '').toUpperCase())
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  function metricLabel(metric) {
    return metric === 'natural' ? '自然排名' : metric === 'sp' ? 'SP排名' : '自然 / SP排名';
  }

  function renderProductTable(model) {
    const rows = Array.isArray(model?.dashboardRows) ? model.dashboardRows.slice(0, 100) : [];
    if (!rows.length) return '<div class="competitor-drawer-empty">该竞品还没有导入报表数据。<br>请用顶部“本地导入”或自动导入今日报表导入对应 ASIN 的文件。</div>';
    return `<div class="competitor-table-wrap"><table class="competitor-table"><thead><tr><th>流量排名</th><th>关键词</th><th>翻译</th><th>自然排名</th><th>SP排名</th><th>周ABA排名</th><th>周搜索量</th><th>状态</th></tr></thead><tbody>${rows.map((row) => `
      <tr><td class="number">${numberText(row.trafficRank)}</td><td class="keyword" title="${escapeHtml(row.keyword)}">${escapeHtml(row.keyword || '—')}</td><td>${escapeHtml(row.translation || '—')}</td><td class="number">${rankText(row.naturalRank)}</td><td class="number">${rankText(row.spRank)}</td><td class="number">${numberText(row.weeklyAbaRank)}</td><td class="number">${numberText(row.weeklySearchVolume)}</td><td class="${row.status === '本日报表未出现' ? 'status-missing' : ''}">${escapeHtml(row.status || '正常')}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function renderProductDrawer(data, owner) {
    const competitors = ownerCompetitors(data, owner);
    if (!competitors.length) return `<div class="competitor-drawer-empty">“${escapeHtml(owner?.modelName || '当前产品')}”还没有设置竞品。<br><button type="button" data-open-competitor-settings>去设置添加竞品</button></div>`;
    const ownerLatest = owner?.latestDate || '暂无日期';
    const ownerCard = `<section class="competitor-owner-card"><div class="competitor-card-head"><div class="competitor-card-title"><strong>自己的产品 · ${escapeHtml(owner.modelName)}</strong><small>${escapeHtml(owner.parentAsin)} · 最新报表 ${escapeHtml(ownerLatest)}</small></div><span class="competitor-card-badge">${numberText(owner.dashboardRows?.length || 0)} 个关键词</span></div><div class="competitor-owner-meta"><span>自然有排名 <b>${numberText(owner.metrics?.keywordCount - owner.metrics?.unrankedNatural || 0)}</b></span><span>关注词 <b>${numberText(owner.metrics?.watchedCount || 0)}</b></span><span>国家 <b>${escapeHtml(owner.site || owner.countryCode || '—')}</b></span></div></section>`;
    const cards = competitors.map((competitor) => `<section class="competitor-product-card"><div class="competitor-card-head"><div class="competitor-card-title"><strong>${escapeHtml(competitor.competitorName || competitor.modelName || '竞品')}</strong><small>${escapeHtml(competitor.parentAsin)} · ${escapeHtml(competitor.site || competitor.countryCode || '')} · 最新报表 ${escapeHtml(competitor.latestDate || '暂无')}</small></div><div class="competitor-card-actions"><span class="competitor-card-badge">${numberText(competitor.dashboardRows?.length || 0)} 个关键词</span><button type="button" class="competitor-refresh-button" data-competitor-import="${escapeHtml(competitor.parentAsin)}" data-competitor-country="${escapeHtml(competitor.countryCode || 'CA')}" data-competitor-name="${escapeHtml(competitor.competitorName || competitor.modelName || '')}">自动导入</button></div></div>${renderProductTable(competitor)}</section>`).join('');
    return `<p class="competitor-drawer-note">竞品数据沿用自有产品的日报字段和排序方式；报表按父体 ASIN 自动归档。点击关键词旁的“竞品”可查看单词对比。</p>${ownerCard}${cards}`;
  }

  function renderCompareRow(label, model, keyword, date, isSelf, metric) {
    const row = modelKeywordRow(model, keyword, date);
    const missing = !row;
    const natural = row?.naturalRank;
    const sp = row?.spRank;
    const aba = row?.weeklyAbaRank;
    const search = row?.weeklySearchVolume;
    return `<tr class="${isSelf ? 'self-row' : ''}"><td>${escapeHtml(label)}</td><td>${escapeHtml(model?.parentAsin || '—')}</td><td>${escapeHtml(row?.snapshotDate || '—')}</td><td class="number ${metric === 'natural' ? 'highlight-rank' : ''}">${rankText(natural)}</td><td class="number ${metric === 'sp' ? 'highlight-rank' : ''}">${rankText(sp)}</td><td class="number">${numberText(aba)}</td><td class="number">${numberText(search)}</td><td class="number">${numberText(row?.trafficRank)}</td><td class="${missing || row?.status === '本日报表未出现' ? 'competitor-no-data' : ''}">${missing ? '未导入' : escapeHtml(row?.status || '正常')}</td></tr>`;
  }

  function renderKeywordDrawer(data, owner, context) {
    const competitors = ownerCompetitors(data, owner);
    const date = context.date || owner?.latestDate || '';
    if (!competitors.length) return `<div class="competitor-drawer-empty">“${escapeHtml(owner?.modelName || '当前产品')}”还没有设置竞品。<br><button type="button" data-open-competitor-settings>去设置添加竞品</button></div>`;
    const metric = context.metric === 'natural' || context.metric === 'sp' ? context.metric : '';
    const rows = renderCompareRow(`自己 · ${owner.modelName}`, owner, context.keyword, date, true, metric)
      + competitors.map((competitor) => renderCompareRow(competitor.competitorName || competitor.modelName, competitor, context.keyword, date, false, metric)).join('');
    return `<p class="competitor-drawer-note">关键词：<b>${escapeHtml(context.keyword)}</b>　目标日期：<b>${escapeHtml(date || '最新日期')}</b>　维度：<b>${escapeHtml(metricLabel(metric))}</b><br>排名数字越小越好；各产品优先显示目标日期，若该日没有报表则回退到该产品最近日报，实际日期见表格。</p><section class="competitor-compare-section"><div class="competitor-card-head"><div class="competitor-card-title"><strong>自身与竞品排名对比</strong><small>保留与看板相同的自然、SP、ABA、搜索量和状态字段</small></div></div><div class="competitor-table-wrap"><table class="competitor-table competitor-compare-table"><thead><tr><th>产品</th><th>父体 ASIN</th><th>数据日期</th><th>自然排名</th><th>SP排名</th><th>周ABA排名</th><th>周搜索量</th><th>流量排名</th><th>状态</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }

  async function renderCompetitorDrawer(context) {
    const overlay = ensureCompetitorDrawer();
    const body = overlay.querySelector('[data-competitor-drawer-body]');
    const subtitle = overlay.querySelector('[data-competitor-drawer-subtitle]');
    if (!body || !subtitle) return;
    body.innerHTML = '<div class="competitor-drawer-loading">正在读取竞品数据……</div>';
    const api = window.keywordTracker;
    try {
      const data = await api.getData();
      const owner = ownerModelFromData(data, context.ownerAsin);
      if (!owner) throw new Error('找不到当前自有产品。');
      const competitors = ownerCompetitors(data, owner);
      overlay._competitorContext = context;
      if (context.mode === 'keyword') {
        overlay.querySelector('#competitor-drawer-title').textContent = '竞品对比';
        subtitle.textContent = `${owner.modelName} · ${context.keyword} · ${competitors.length} 个竞品`;
        body.innerHTML = renderKeywordDrawer(data, owner, context);
      } else {
        overlay.querySelector('#competitor-drawer-title').textContent = '竞品信息';
        subtitle.textContent = `${owner.modelName} · ${competitors.length} 个竞品`;
        body.innerHTML = renderProductDrawer(data, owner);
      }
      body.querySelector('[data-open-competitor-settings]')?.addEventListener('click', () => {
        closeCompetitorDrawer();
        document.querySelector('button') && [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === '设置')?.click();
      });
      body.querySelectorAll('[data-competitor-import]').forEach((button) => {
        button.addEventListener('click', async () => {
          if (button.disabled) return;
          const asin = button.getAttribute('data-competitor-import');
          const countryCode = button.getAttribute('data-competitor-country') || 'CA';
          button.disabled = true;
          button.textContent = '导入中…';
          try {
            const response = await api.startSifImport({ parentAsin: asin, countryCode });
            button.textContent = response?.ok === false ? '重试导入' : '已导入';
            window.setTimeout(() => renderCompetitorDrawer(context), 600);
          } catch (error) {
            button.disabled = false;
            button.textContent = '重试导入';
            button.title = error?.message || '自动导入失败';
          }
        });
      });
    } catch (error) {
      body.innerHTML = `<div class="competitor-drawer-empty">${escapeHtml(error?.message || '读取竞品数据失败，请刷新后重试。')}</div>`;
    }
  }

  function openCompetitorDrawer(context = {}) {
    const overlay = ensureCompetitorDrawer();
    overlay._competitorContext = context;
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('competitor-drawer-open');
    renderCompetitorDrawer(context);
  }

  function sidebarRowDetails(item, data) {
    const copy = item?.querySelector('.model-copy');
    const first = copy?.querySelector('strong')?.textContent?.trim() || '';
    const second = copy?.querySelector('small')?.textContent?.trim() || '';
    // The production sidebar splits a model name at the first space and puts
    // the remainder in <small>; only when there is no remainder does that
    // node contain the ASIN.  Competitor names commonly contain spaces, so
    // reading <small> as the ASIN would incorrectly produce values such as
    // "COMPETITOR" and leave the real competitor row visible at top level.
    const models = Array.isArray(data?.models) ? data.models : [];
    const matched = models.find((model) => {
      const modelName = String(model?.modelName || '').trim();
      const head = modelName.split(/\s+/u)[0] || '';
      const tail = modelName.replace(head, '').trim() || normalizedAsin(model?.parentAsin);
      return head === first && (tail === second || normalizedAsin(model?.parentAsin) === normalizedAsin(second));
    }) || models.find((model) => String(model?.modelName || '').trim() === first)
      || models.find((model) => normalizedAsin(model?.parentAsin) === normalizedAsin(second));
    return {
      asin: normalizedAsin(item?.getAttribute('data-model-asin') || matched?.parentAsin || second),
      name: matched?.modelName || first,
    };
  }

  function sidebarCompetitorsFor(data, ownerAsin) {
    const owner = normalizedAsin(ownerAsin);
    return competitorModelsFromData(data)
      .filter((competitor) => normalizedAsin(competitor?.ownerParentAsin) === owner)
      .sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0));
  }

  function syncSidebarSelection() {
    const activeAsin = getCurrentAsin();
    document.querySelectorAll(`[${COMPETITOR_LIST_ATTR}]`).forEach((list) => {
      const ownerRow = list.previousElementSibling;
      const ownerAsin = sidebarRowDetails(ownerRow).asin;
      const selected = [...list.querySelectorAll(`[${COMPETITOR_ITEM_ATTR}]`)]
        .some((line) => normalizedAsin(line.getAttribute('data-competitor-asin')) === activeAsin);
      list.querySelectorAll(`[${COMPETITOR_ITEM_ATTR}]`).forEach((line) => {
        line.classList.toggle('is-selected', normalizedAsin(line.getAttribute('data-competitor-asin')) === activeAsin);
      });
      const toggle = ownerRow?.querySelector(`[${COMPETITOR_SIDEBAR_ATTR}]`);
      if (selected) {
        toggle?.setAttribute('aria-expanded', 'true');
        list.hidden = false;
      }
    });
  }

  function renderCompetitorSidebar(data) {
    const modelList = document.querySelector('.model-list');
    if (!(modelList instanceof HTMLElement)) return;
    const competitors = competitorModelsFromData(data);
    const competitorAsins = new Set(competitors.flatMap((competitor) => [
      competitor?.parentAsin,
      ...(competitor?.legacyParentAsins || []),
    ].map(normalizedAsin).filter(Boolean)));
    const ownAsins = new Set(ownModelsFromData(data).flatMap((model) => [
      model?.parentAsin,
      ...(model?.legacyParentAsins || []),
    ].map(normalizedAsin).filter(Boolean)));
    const activeAsin = getCurrentAsin();

    [...modelList.children].forEach((node) => {
      if (!(node instanceof HTMLElement) || !node.classList.contains('model-item')) return;
      const { asin, name } = sidebarRowDetails(node, data);
      if (!asin) return;
      node.setAttribute('data-model-asin', asin);
      if (competitorAsins.has(asin)) {
        node.setAttribute(COMPETITOR_TOP_LEVEL_ATTR, 'true');
        node.setAttribute('aria-hidden', 'true');
        return;
      }
      node.removeAttribute(COMPETITOR_TOP_LEVEL_ATTR);
      node.removeAttribute('aria-hidden');
      const ownerCompetitors = sidebarCompetitorsFor(data, asin);
      let toggle = node.querySelector(`[${COMPETITOR_SIDEBAR_ATTR}]`);
      if (!toggle) {
        toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'dropdown-btn competitor-sidebar-toggle';
        toggle.setAttribute(COMPETITOR_SIDEBAR_ATTR, '');
        toggle.setAttribute('aria-controls', `${COMPETITOR_DRAWER_ID}-${asin}`);
        toggle.setAttribute('aria-expanded', 'false');
        toggle.innerHTML = '<span aria-hidden="true">⌄</span>';
        toggle.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const list = node.nextElementSibling?.matches(`[${COMPETITOR_LIST_ATTR}]`) ? node.nextElementSibling : null;
          const expanded = toggle.getAttribute('aria-expanded') === 'true';
          toggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
          if (list) list.hidden = expanded;
        });
        node.appendChild(toggle);
      } else {
        toggle.classList.add('dropdown-btn');
        toggle.classList.add('competitor-sidebar-toggle');
        toggle.setAttribute('aria-controls', `${COMPETITOR_DRAWER_ID}-${asin}`);
        if (!toggle.querySelector('span')) toggle.innerHTML = '<span aria-hidden="true">⌄</span>';
      }
      const copy = node.querySelector('.model-copy');
      if (copy && !copy.hasAttribute('data-competitor-selection-sync')) {
        copy.setAttribute('data-competitor-selection-sync', '');
        copy.addEventListener('click', () => window.setTimeout(syncSidebarSelection, 0));
      }
      toggle.setAttribute('aria-label', `${toggle.getAttribute('aria-expanded') === 'true' ? '收起' : '展开'} ${name} 的竞品`);
      toggle.title = ownerCompetitors.length ? `${toggle.getAttribute('aria-expanded') === 'true' ? '收起' : '展开'}竞品` : '展开竞品（暂无已设置竞品）';

      let list = node.nextElementSibling;
      if (!(list instanceof HTMLElement) || !list.hasAttribute(COMPETITOR_LIST_ATTR)) {
        list = document.createElement('div');
        list.className = 'competitor-sidebar-list';
        list.setAttribute(COMPETITOR_LIST_ATTR, '');
        list.id = `${COMPETITOR_DRAWER_ID}-${asin}`;
        node.insertAdjacentElement('afterend', list);
      }
      const signature = ownerCompetitors.map((competitor) => `${competitor.competitorId || competitor.id || competitor.parentAsin}:${competitor.competitorName || competitor.modelName}`).join('|');
      if (list.dataset.signature !== signature) {
        list.textContent = '';
        list.dataset.signature = signature;
        if (!ownerCompetitors.length) {
          const empty = document.createElement('div');
          empty.className = 'competitor-sidebar-empty';
          empty.textContent = '暂无已设置竞品';
          list.appendChild(empty);
        } else {
          ownerCompetitors.forEach((competitor) => {
            const competitorAsin = normalizedAsin(competitor.parentAsin);
            const line = document.createElement('div');
            line.className = 'competitor-sidebar-item';
            line.setAttribute(COMPETITOR_ITEM_ATTR, '');
            line.setAttribute('data-competitor-asin', competitorAsin);
            line.innerHTML = `<span class="competitor-sidebar-branch" aria-hidden="true">├─</span><button type="button" class="competitor-sidebar-copy"><strong>${escapeHtml(competitor.competitorName || competitor.modelName || '未命名竞品')}</strong><small>${escapeHtml(competitorAsin)}</small></button><span class="competitor-sidebar-badge">竞品</span>`;
            const copy = line.querySelector('.competitor-sidebar-copy');
            copy?.addEventListener('click', (event) => {
              event.preventDefault();
              event.stopPropagation();
              toggle.setAttribute('aria-expanded', 'true');
              list.hidden = false;
              const hiddenRow = [...modelList.querySelectorAll(':scope > .model-item')]
                .find((candidate) => sidebarRowDetails(candidate).asin === competitorAsin);
              hiddenRow?.querySelector('.model-copy')?.click();
              window.setTimeout(() => renderCompetitorSidebar(data), 0);
            });
            list.appendChild(line);
          });
        }
      }
      const selectedCompetitor = ownerCompetitors.some((competitor) => normalizedAsin(competitor.parentAsin) === activeAsin);
      if (selectedCompetitor) toggle.setAttribute('aria-expanded', 'true');
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      list.hidden = !expanded;
      list.querySelectorAll(`[${COMPETITOR_ITEM_ATTR}]`).forEach((line) => {
        line.classList.toggle('is-selected', normalizedAsin(line.getAttribute('data-competitor-asin')) === activeAsin);
      });
    });
    modelList.querySelectorAll(`[${COMPETITOR_LIST_ATTR}]`).forEach((list) => {
      const ownerRow = list.previousElementSibling;
      const ownerAsin = sidebarRowDetails(ownerRow).asin;
      if (!ownAsins.has(ownerAsin)) list.remove();
    });
    syncSidebarSelection();
  }

  function scanCompetitorSidebar() {
    if (!document.querySelector('.model-list > .model-item')) return;
    dataForEnhancements().then((data) => { if (data) renderCompetitorSidebar(data); });
  }

  function scanCompetitorKeywordButtons() {
    const cells = [
      ...document.querySelectorAll('.dashboard-table tbody td.keyword-cell'),
      ...document.querySelectorAll('.matrix-table:not(.aba-table) tbody td.keyword-col'),
    ];
    cells.forEach((cell) => {
      if (!(cell instanceof HTMLElement) || cell.querySelector(`[${COMPETITOR_KEYWORD_ATTR}]`)) return;
      const keyword = cell.getAttribute('data-keyword')?.trim()
        || cell.getAttribute('title')?.trim()
        || cell.textContent?.trim()
        || '';
      if (!keyword) return;
      const table = cell.closest('table');
      const isDashboard = table?.classList.contains('dashboard-table');
      const note = table?.closest('.matrix-panel')?.querySelector('.matrix-note')?.textContent || '';
      const metric = isDashboard ? '' : /SP矩阵/u.test(note) ? 'sp' : 'natural';
      const label = document.createElement('span');
      label.className = 'competitor-keyword-label';
      label.textContent = keyword;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'competitor-keyword-button';
      button.setAttribute(COMPETITOR_KEYWORD_ATTR, '');
      button.textContent = '竞品';
      button.title = `查看“${keyword}”的竞品对比`;
      button.setAttribute('aria-label', `查看 ${keyword} 的竞品对比`);
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        // Pass the currently displayed model ASIN.  The drawer resolves a
        // competitor back to its owning self product through ownerParentAsin,
        // so a competitor page never gets treated as a new owner.
        const ownerAsin = getCurrentAsin();
        const selectedDate = table?.closest('.app-shell')?.querySelector('.date-control input[type="date"]')?.value || '';
        openCompetitorDrawer({ mode: 'keyword', ownerAsin, keyword, metric, date: selectedDate });
      });
      while (cell.firstChild) cell.removeChild(cell.firstChild);
      cell.classList.add('competitor-keyword-cell');
      cell.append(label, button);
    });
  }

  function scanCompetitorUi() {
    ensureCompetitorDrawer();
    scanCompetitorSidebar();
    scanCompetitorKeywordButtons();
  }

  function scan() {
    addStyles();
    // A matrix table can disappear without a pointerout when React switches
    // tabs or products. Do this check before scanning the newly rendered UI so
    // a detached bubble never survives into the next view.
    if (matrixBubbleAnchorCell && (!matrixBubbleAnchorCell.isConnected || !matrixBubbleAnchorTable?.isConnected)) hideMatrixBubble();
    document.querySelectorAll('.settings-delete-item').forEach(installEditor);
    if (sidebarDataCache) syncCompetitorSettingsItems(sidebarDataCache);
    installAbaImport();
    installCompetitorSettings();
    installBatchButton();
    scanAbaTables();
    scanCompetitorUi();
    // The keyword-cell enhancer replaces the cell's React children with the
    // label + comparison button.  Install matrix hover handlers afterwards so
    // they attach to the final DOM in one pass and do not race that rewrite.
    scanMatrices();
  }

  function batchItemsFromData(data) {
    const ownItems = ownModelsFromData(data).map((model) => ({
      asin: model.parentAsin,
      countryCode: model.countryCode || model.site || 'CA',
      modelName: model.modelName,
      kind: 'own',
    }));
    const competitorItems = competitorModelsFromData(data).map((competitor) => ({
      asin: competitor.parentAsin,
      countryCode: competitor.countryCode || competitor.site || 'CA',
      modelName: competitor.competitorName || competitor.modelName,
      kind: 'competitor',
    }));
    return [...ownItems, ...competitorItems];
  }

  async function runAllBatchImport({ trigger, peer, status, setStatus }) {
    if (trigger?.dataset.batchBusy === 'true') return;
    const api = window.keywordTracker;
    if (!api || typeof api.startSifBatchImport !== 'function' || typeof api.getData !== 'function') {
      setStatus('当前网页未加载批量自动导入功能，请刷新后重试。', true);
      return;
    }
    trigger.dataset.batchBusy = 'true';
    if (peer) peer.dataset.batchBusy = 'true';
    if (trigger) trigger.disabled = true;
    if (peer) peer.disabled = true;
    setStatus('正在读取产品、竞品和国家设置……');
    try {
      const data = await api.getData();
      sidebarDataCache = data;
      matrixDataCache = data;
      const items = batchItemsFromData(data);
      if (!items.length) throw new Error('当前没有已登记产品或竞品。');
      // startSifBatchImport submits one extension job for own products and
      // only after it settles submits the competitor job.  The explicit kind
      // values here also protect the ordering when callers pass custom data.
      const response = await api.startSifBatchImport({ items });
      if (!response?.ok) throw new Error(response?.output || '批量自动导入失败。');
      setStatus(response?.output || '全部产品已下载并导入。');
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setStatus(error?.message || '批量自动导入失败，请重试。', true);
      if (trigger) { trigger.disabled = false; delete trigger.dataset.batchBusy; }
      if (peer) { peer.disabled = false; delete peer.dataset.batchBusy; }
    }
  }

  function installBatchButton() {
    const singleButton = document.querySelector('button.sif-import-button');
    if (!singleButton) return;
    const button = document.querySelector(`[${BATCH_ATTR}]`);
    if (button) {
      installAutomaticBatchCapture(singleButton, button, button.nextElementSibling);
      return;
    }
    singleButton.title = '按设置里的国家先导入全部自己产品，再导入全部竞品';
    const allButton = document.createElement('button');
    allButton.type = 'button';
    allButton.className = 'primary-button sif-all-import-button';
    allButton.setAttribute(BATCH_ATTR, '');
    allButton.textContent = '一键导入全部产品';
    allButton.title = '先导入所有自己产品，再统一导入所有竞品';
    const status = document.createElement('small');
    status.className = 'sif-all-import-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    singleButton.insertAdjacentElement('afterend', allButton);
    allButton.insertAdjacentElement('afterend', status);

    let unsubscribe = null;
    const setStatus = (message, isError = false) => {
      status.textContent = message || '';
      status.classList.toggle('is-error', isError);
    };
    const bridge = window.keywordTracker;
    if (bridge && typeof bridge.onSifProgress === 'function') {
      unsubscribe = bridge.onSifProgress((event) => {
        if (event?.message && (allButton.disabled || singleButton.disabled)) setStatus(String(event.message));
      });
    }
    allButton.addEventListener('click', () => {
      runAllBatchImport({ trigger: allButton, peer: singleButton, status, setStatus }).catch((error) => setStatus(error?.message || '批量自动导入失败。', true));
    });
    allButton.addEventListener('DOMNodeRemoved', () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    }, { once: true });
    installAutomaticBatchCapture(singleButton, allButton, status, setStatus);
  }

  function installAutomaticBatchCapture(singleButton, allButton, status, inheritedSetStatus) {
    if (!(singleButton instanceof HTMLElement) || singleButton.hasAttribute(AUTO_BATCH_CAPTURE_ATTR)) return;
    singleButton.setAttribute(AUTO_BATCH_CAPTURE_ATTR, '');
    const setStatus = inheritedSetStatus || ((message, isError = false) => {
      if (!status) return;
      status.textContent = message || '';
      status.classList.toggle('is-error', isError);
    });
    // The bundle's React click handler is delegated at the root.  Capturing
    // this event on the button prevents it from starting the old single-item
    // action, while keeping the separate local/manual import button untouched.
    singleButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      runAllBatchImport({ trigger: singleButton, peer: allButton, status, setStatus }).catch((error) => setStatus(error?.message || '批量自动导入失败。', true));
    }, true);
  }

  addStyles();
  const invalidateEnhancementData = () => {
    sidebarDataCache = null;
    sidebarDataPromise = null;
    matrixDataCache = null;
    matrixDataPromise = null;
    matrixLookupCache = null;
    scheduleScan();
    document.querySelectorAll(`[${COMPETITOR_SETTINGS_ATTR}]`).forEach((section) => {
      section._refreshCompetitorSettings?.();
    });
    const overlay = document.getElementById(COMPETITOR_DRAWER_ID);
    if (overlay?.classList.contains('is-open') && overlay._competitorContext) {
      renderCompetitorDrawer(overlay._competitorContext);
    }
  };
  window.addEventListener('keyword-tracker-competitor-updated', invalidateEnhancementData);
  window.addEventListener('keyword-tracker-aba-imported', () => {
    matrixDataCache = null;
    matrixDataPromise = null;
    matrixLookupCache = null;
    document.querySelectorAll('table.aba-table').forEach((table) => {
      delete table.dataset.abaComparisonColumns;
      enhanceAbaTable(table);
    });
  });
  // React re-renders the tables and sidebar in several small child-list
  // bursts.  Running the full enhancement pass synchronously for every
  // mutation can starve the browser (especially after a competitor is added,
  // when an extra sidebar row is mounted).  Coalesce those bursts onto a
  // macrotask and never re-enter a scan while one is still running.  This
  // keeps the page responsive while retaining the existing "enhance after
  // React render" behaviour.
  let scanScheduled = false;
  let scanRunning = false;
  const SCAN_DELAY_MS = 64;
  const scheduleScan = () => {
    if (scanScheduled) return;
    scanScheduled = true;
    window.setTimeout(() => {
      scanScheduled = false;
      if (scanRunning) {
        scheduleScan();
        return;
      }
      scanRunning = true;
      try { scan(); } finally { scanRunning = false; }
    }, SCAN_DELAY_MS);
  };
  const observer = new MutationObserver(() => {
    // MutationObserver runs after React commits child-list changes, including
    // unmounting the table that owns the current hover. Clear the bubble in
    // this microtask instead of waiting for the debounced enhancement scan.
    if (matrixBubbleAnchorCell && (!matrixBubbleAnchorCell.isConnected || !matrixBubbleAnchorTable?.isConnected)) hideMatrixBubble();
    scheduleScan();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  // Let the initial React render commit before the first enhancement pass.
  // This is especially important when the persisted store already contains
  // competitors: React mounts the extra model-shaped rows asynchronously and
  // should not reconcile them while we are inserting the nested navigation.
  window.setTimeout(scheduleScan, 80);
})();
