import { ICommandService, IUniverInstanceService, IUndoRedoService, UserManagerService, UniverInstanceType, UndoCommand, RedoCommand } from '@univerjs/core';
import { useDependency } from '../../utils/di';
import React, { useEffect, useState, useRef } from 'react';
import { Undo2, Redo2, Save, Clock, Home, Menu, Zap, Settings, LogOut, User, LayoutDashboard } from 'lucide-react';

export function OnlyOfficeTitleBar() {
  const univerInstanceService = useDependency(IUniverInstanceService);
  const commandService = useDependency(ICommandService);
  const undoRedoService = useDependency(IUndoRedoService);
  const userManagerService = useDependency(UserManagerService);

  const [title, setTitle] = useState('Untitled.xlsx');
  const [user, setUser] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editVal, setEditVal] = useState('');

  // Menu State
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  // Profile Menu State
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  // Unit Type State
  const [unitType, setUnitType] = useState<UniverInstanceType>(UniverInstanceType.UNIVER_SHEET);
  // Undo/Redo Status
  const [undoDisabled, setUndoDisabled] = useState(true);
  const [redoDisabled, setRedoDisabled] = useState(true);
  // Submenu hover state
  const [hoveredSubmenu, setHoveredSubmenu] = useState<string | null>(null);

  const navigateHome = () => {
    window.location.href = '/';
  };

  useEffect(() => {
    const update = () => {
      // Priorities: Sheet > Doc > Slide (or whatever is current)
      // Since we don't know which is active, we check all.
      const sheet = univerInstanceService.getCurrentUnitForType(UniverInstanceType.UNIVER_SHEET);
      const doc = univerInstanceService.getCurrentUnitForType(UniverInstanceType.UNIVER_DOC);
      const slide = univerInstanceService.getCurrentUnitForType(UniverInstanceType.UNIVER_SLIDE);

      // URL parameters are the primary source of truth for the UI mode
      const urlParams = new URLSearchParams(window.location.search);
      const urlFile = urlParams.get('file');
      const urlType = urlParams.get('type');
      const pathname = window.location.pathname.toLowerCase();

      if (urlType === 'ppt' || urlType === 'slide' || pathname.includes('/ppt') || pathname.includes('/slide')) {
        setUnitType(UniverInstanceType.UNIVER_SLIDE);
        setTitle(urlFile || (slide as any)?.getName?.() || 'Untitled.pptx');
      } else if (urlType === 'doc' || pathname.includes('/doc')) {
        setUnitType(UniverInstanceType.UNIVER_DOC);
        setTitle(urlFile || (doc as any)?.getName?.() || 'Untitled.docx');
      } else if (urlType === 'sheet' || urlType === 'excel' || pathname.includes('/sheet') || pathname.includes('/excel')) {
        setUnitType(UniverInstanceType.UNIVER_SHEET);
        setTitle(urlFile || (sheet as any)?.getName?.() || 'Untitled.xlsx');
      } else {
        // Fallback to unit detection if urlType and pathname are ambiguous
        if (sheet) {
          setUnitType(UniverInstanceType.UNIVER_SHEET);
          setTitle(urlFile || (sheet as any).getName?.() || 'Untitled.xlsx');
        } else if (doc) {
          setUnitType(UniverInstanceType.UNIVER_DOC);
          setTitle(urlFile || (doc as any).getName?.() || 'Untitled.docx');
        } else if (slide) {
          setUnitType(UniverInstanceType.UNIVER_SLIDE);
          setTitle(urlFile || (slide as any)?.getName?.() || 'Untitled.pptx');
        }
      }
    };

    // 1. Initial Sync
    update();

    // 2. Poll for Unit (Retry for 10 seconds if not found)
    const interval = setInterval(() => {
      update();
    }, 200);
    setTimeout(() => clearInterval(interval), 10000);

    // 3. User Sync
    const sub = userManagerService.currentUser$.subscribe((u) => setUser(u));

    // 4. Undo/Redo Status
    const undoSub = undoRedoService.undoRedoStatus$.subscribe((status) => {
      setUndoDisabled(status.undos <= 0);
      setRedoDisabled(status.redos <= 0);
    });

    // 5. URL change listener
    window.addEventListener('popstate', update);

    // 6. Close Menus on outside click
    const closeMenu = (e: MouseEvent) => {
      setActiveMenu(null);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    window.addEventListener('click', closeMenu);

    return () => {
      clearInterval(interval);
      sub.unsubscribe();
      undoSub.unsubscribe();
      window.removeEventListener('popstate', update);
      window.removeEventListener('click', closeMenu);
    };
  }, [univerInstanceService, userManagerService]);

  // File picker helper for import actions
  const pickAndDispatch = (accept: string) => {
    console.log('📂 [TitleBar] pickAndDispatch called, accept:', accept);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.position = 'fixed';
    input.style.left = '-10000px';
    document.body.appendChild(input);
    input.onchange = () => {
      const file = input.files?.[0];
      console.log('📂 [TitleBar] File selected:', file?.name, file?.size, 'bytes');
      if (file) {
        // Dispatch event for UniverExcelEditorDirect to handle
        console.log('📤 [TitleBar] Dispatching edusense:file-import event');
        window.dispatchEvent(new CustomEvent('edusense:file-import', { detail: { file } }));
      }
      try { document.body.removeChild(input); } catch { }
    };
    input.click();
  };

  // Import/Export accept map
  // NOTE: doc.command.* commands are handled by UniverMarkdownPlugin with their own file pickers,
  // so they should NOT be intercepted here. Only intercept commands that need the
  // edusense:file-import event flow (for UniverExcelEditorDirect/sheet mode).
  const IMPORT_ACCEPT: Record<string, string> = {
    'sheet.command.import-xlsx': '.xlsx,.xls',
    'sheet.command.import-csv': '.csv,.tsv',
    'sheet.command.import-pptx': '.pptx,.ppt',
  };

  const exec = (id: string, params?: any) => {
    console.log('🎯 [TitleBar] exec called:', id);
    setActiveMenu(null);
    setHoveredSubmenu(null);
    // Handle import commands directly via file picker
    if (IMPORT_ACCEPT[id]) {
      console.log('📂 [TitleBar] Import command matched, opening file picker for:', IMPORT_ACCEPT[id]);
      pickAndDispatch(IMPORT_ACCEPT[id]);
      return;
    }
    // All other commands (including export) go through command service
    console.log('⚡ [TitleBar] Executing command via commandService:', id);
    commandService.executeCommand(id, params);
  }

  const handleRename = () => {
    if (editVal.trim() && editVal !== title) {
      setTitle(editVal); // Optimistic Update
      commandService.executeCommand('host.operation.rename', { name: editVal });
    }
    setIsEditing(false);
  };

  // Adaptive Configuration
  const getThemeColor = () => {
    switch (unitType) {
      case UniverInstanceType.UNIVER_DOC: return '#2b579a'; // Word Blue
      case UniverInstanceType.UNIVER_SLIDE: return '#d24726'; // PPT Orange
      case UniverInstanceType.UNIVER_SHEET: default: return '#107c41'; // Excel Green
    }
  };

  const APP_MENUS = {
    File: [
      { label: 'New', cmd: 'host.operation.new' },
      { label: 'Open', cmd: 'host.operation.open' },
      { label: 'Save', cmd: 'host.operation.save' },
      { label: 'Print', cmd: 'host.operation.print' },
    ],
    Edit: [
      { label: 'Undo', cmd: UndoCommand.id },
      { label: 'Redo', cmd: RedoCommand.id },
      { label: 'Copy', cmd: 'sheet.command.copy' },
      { label: 'Paste', cmd: 'sheet.command.paste' },
    ],
    View: [
      { label: 'Zoom In', cmd: 'sheet.command.set-zoom-ratio', icon: 'zoom-in' },
      { label: 'Zoom Out', cmd: 'sheet.command.zoom-out' },
      { label: 'Macros', cmd: 'host.operation.macros' },
    ]
  };

  type MenuItem = { label: string; cmd?: string; icon?: any; children?: MenuItem[] };

  const getMenuItems = (): Record<string, MenuItem[]> => {
    // Import submenu (varies by unit type)
    const importChildren: MenuItem[] = unitType === UniverInstanceType.UNIVER_SHEET ? [
      { label: 'Excel (.xlsx, .xls)', cmd: 'sheet.command.import-xlsx' },
      { label: 'CSV (.csv)', cmd: 'sheet.command.import-csv' },
      { label: 'PowerPoint (.pptx)', cmd: 'sheet.command.import-pptx' },
    ] : unitType === UniverInstanceType.UNIVER_SLIDE ? [
      { label: 'PowerPoint (.pptx)', cmd: 'sheet.command.import-pptx' },
    ] : [
      { label: 'HWPX (.hwpx)', cmd: 'doc.command.import-hwpx' },
      { label: 'HTML (.html)', cmd: 'doc.command.import-html' },
      { label: 'Markdown (.md)', cmd: 'doc.command.import-markdown' },
      { label: 'DOCX (.docx)', cmd: 'doc.command.import-docx' },
      { label: 'JSON (.json)', cmd: 'doc.command.import-json' },
    ];

    // Export submenu (Doc mode only)
    const exportChildren: MenuItem[] = unitType === UniverInstanceType.UNIVER_DOC ? [
      { label: 'Markdown (.md)', cmd: 'doc.command.export-markdown' },
      { label: 'DOCX (.doc)', cmd: 'doc.command.export-docx' },
      { label: 'JSON (.json)', cmd: 'doc.command.export-json' },
    ] : [];

    const fileMenu: MenuItem[] = [
      { label: 'New', cmd: 'host.operation.new' },
      { label: 'Open', cmd: 'host.operation.open' },
      { label: 'Save', cmd: 'host.operation.save' },
      { label: 'Import', children: importChildren },
      ...(exportChildren.length ? [{ label: 'Export', children: exportChildren }] : []),
      { label: 'Print', cmd: 'host.operation.print' },
    ];

    const editMenu: MenuItem[] = [
      { label: 'Undo', cmd: UndoCommand.id },
      { label: 'Redo', cmd: RedoCommand.id },
      { label: 'Copy', cmd: unitType === UniverInstanceType.UNIVER_SHEET ? 'sheet.command.copy' : 'doc.command.copy' },
      { label: 'Paste', cmd: unitType === UniverInstanceType.UNIVER_SHEET ? 'sheet.command.paste' : 'doc.command.paste' },
    ];

    const viewMenu: MenuItem[] = [
      { 
        label: 'Zoom In', 
        cmd: unitType === UniverInstanceType.UNIVER_SHEET ? 'sheet.command.set-zoom-ratio' : 'doc.command.set-zoom-ratio', 
        icon: 'zoom-in' 
      },
      { 
        label: 'Zoom Out', 
        cmd: unitType === UniverInstanceType.UNIVER_SHEET ? 'sheet.command.zoom-out' : 'doc.command.zoom-out' 
      },
      { label: 'Macros', cmd: 'host.operation.macros' },
    ];

    const menus: Record<string, MenuItem[]> = {
      File: fileMenu,
      Edit: editMenu,
      View: viewMenu,
    };

    if (unitType === UniverInstanceType.UNIVER_SHEET) {
      menus['Insert'] = [
        { label: 'Image', cmd: 'sheet.command.insert-image' },
        { label: 'Chart', cmd: 'sheet.command.insert-chart' },
      ];
      menus['Format'] = [
        { label: 'Bold', cmd: 'sheet.command.set-bold' },
        { label: 'Italic', cmd: 'sheet.command.set-italic' },
      ];
      menus['Data'] = [
        { label: 'Sort A-Z', cmd: 'sheet.command.sort-asc' },
        { label: 'Filter', cmd: 'sheet.command.set-filter' },
      ];
    } else if (unitType === UniverInstanceType.UNIVER_DOC) {
      menus['Insert'] = [
        { label: 'Image', cmd: 'doc.command.insert-image' },
        { label: 'Page Break', cmd: 'doc.command.page-break' },
      ];
      menus['Format'] = [
        { label: 'Bold', cmd: 'doc.command.set-bold' },
        { label: 'Headers', cmd: 'doc.command.headers' },
      ];
      menus['References'] = [
        { label: 'Table of Contents', cmd: 'doc.command.toc' },
      ];
    } else if (unitType === UniverInstanceType.UNIVER_SLIDE) {
      menus['Insert'] = [
        { label: 'New Slide', cmd: 'slide.command.new-slide' },
        { label: 'Shape', cmd: 'slide.command.insert-shape' },
      ];
      menus['Slide Show'] = [
        { label: 'Start from Beginning', cmd: 'slide.command.play' },
      ];
    }

    return menus;
  };

  const MENU_ITEMS = getMenuItems();

  // Profile dropdown menu items
  const profileMenuItems = [
    {
      icon: <User size={14} />,
      label: user?.name || 'Profile',
      subtitle: user?.userID || '',
      onClick: () => { setProfileMenuOpen(false); },
      isHeader: true,
    },
    { divider: true },
    {
      icon: <LayoutDashboard size={14} />,
      label: 'Dashboard',
      onClick: () => { navigateHome(); setProfileMenuOpen(false); },
    },
    {
      icon: <Settings size={14} />,
      label: 'Settings',
      onClick: () => { setProfileMenuOpen(false); },
    },
    { divider: true },
    {
      icon: <LogOut size={14} />,
      label: 'Sign Out',
      danger: true,
      onClick: () => { navigateHome(); setProfileMenuOpen(false); },
    },
  ];

  return (
    <div
      className="onlyoffice-title-bar"
      style={{
        height: '34px',
        backgroundColor: getThemeColor(),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 8px',
        width: '100%',
        color: 'white',
        userSelect: 'none',
        position: 'relative',
        zIndex: 1000,
        fontSize: '12px',
        borderBottom: '1px solid rgba(0,0,0,0.1)'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Home Icon */}
        <button onClick={navigateHome} title="Home" style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: 0.9, padding: '4px' }}>
          <Home size={16} />
        </button>
        <button
          onClick={navigateHome}
          title="Home"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '12px',
            lineHeight: 1,
            opacity: 0.92,
            padding: '4px 6px',
            borderRadius: '4px',
          }}
          className="hover:bg-white/10"
        >
          Office
        </button>

        {/* Menu Tabs */}
        <div style={{ display: 'flex' }}>
          {Object.keys(MENU_ITEMS).map(menu => (
            <div key={menu} style={{ position: 'relative' }}>
              <div
                onClick={() => setActiveMenu(activeMenu === menu ? null : menu)}
                style={{
                  padding: '0 8px',
                  height: '34px',
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  background: activeMenu === menu ? 'white' : 'transparent',
                  color: activeMenu === menu ? getThemeColor() : 'white',
                  fontWeight: 500
                }}
                className="hover:bg-white/10"
              >
                {menu}
              </div>
              {/* Dropdown */}
              {activeMenu === menu && (
                <div style={{
                  position: 'absolute',
                  top: '34px',
                  left: 0,
                  background: 'white',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  borderRadius: '0 0 4px 4px',
                  minWidth: '160px',
                  zIndex: 1001,
                  color: '#333',
                  padding: '4px 0',
                  border: '1px solid #ddd'
                }}>
                  {(MENU_ITEMS as any)[menu].map((item: any) => (
                    <div
                      key={item.label}
                      onClick={() => { if (!item.children) exec(item.cmd || ''); }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#f3f4f6';
                        if (item.children) setHoveredSubmenu(item.label);
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        if (item.children) setHoveredSubmenu(null);
                      }}
                      style={{
                        padding: '6px 16px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        position: 'relative'
                      }}
                    >
                      <span>{item.label}</span>
                      {item.children && <span style={{ fontSize: '10px', opacity: 0.5 }}>▸</span>}
                      {/* Nested submenu */}
                      {item.children && hoveredSubmenu === item.label && (
                        <div style={{
                          position: 'absolute',
                          top: 0,
                          left: '100%',
                          background: 'white',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                          borderRadius: '4px',
                          minWidth: '160px',
                          zIndex: 1002,
                          color: '#333',
                          padding: '4px 0',
                          border: '1px solid #ddd'
                        }}>
                          {item.children.map((sub: any) => (
                            <div
                              key={sub.label}
                              onClick={(e) => { e.stopPropagation(); exec(sub.cmd || ''); }}
                              style={{
                                padding: '6px 16px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                whiteSpace: 'nowrap'
                              }}
                              onMouseEnter={(ev) => ev.currentTarget.style.background = '#f3f4f6'}
                              onMouseLeave={(ev) => ev.currentTarget.style.background = 'transparent'}
                            >
                              {sub.label}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>


        <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.3)', margin: '0 4px' }} />

        {/* QAT Icons (Quick Access) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          <button onClick={() => exec('host.operation.save')} title="Save" style={{ padding: '4px', background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', borderRadius: '4px' }} className="hover:bg-white/10">
            <Save size={16} />
          </button>
          <button onClick={() => exec(UndoCommand.id)} title="Undo" disabled={undoDisabled} style={{ padding: '4px', background: 'transparent', border: 'none', color: 'white', cursor: undoDisabled ? 'default' : 'pointer', borderRadius: '4px', opacity: undoDisabled ? 0.4 : 1 }} className="hover:bg-white/10">
            <Undo2 size={16} />
          </button>
          <button onClick={() => exec(RedoCommand.id)} title="Redo" disabled={redoDisabled} style={{ padding: '4px', background: 'transparent', border: 'none', color: 'white', cursor: redoDisabled ? 'default' : 'pointer', borderRadius: '4px', opacity: redoDisabled ? 0.4 : 1 }} className="hover:bg-white/10">
            <Redo2 size={16} />
          </button>
        </div>

        {/* Title (Editable) */}
        {isEditing ? (
          <input
            autoFocus
            value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onBlur={handleRename}
            onKeyDown={e => {
              if (e.key === 'Enter') handleRename();
              if (e.key === 'Escape') setIsEditing(false);
            }}
            style={{
              color: '#333',
              background: 'white',
              border: 'none',
              borderRadius: '3px',
              padding: '1px 6px',
              fontSize: '12px',
              fontWeight: 600,
              outline: '2px solid #fff',
              textAlign: 'center',
              minWidth: '150px'
            }}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <div
            onClick={() => { setEditVal(title.replace(/\.(xlsx|docx|pptx)$/, '')); setIsEditing(true); }}
            style={{
              fontWeight: 600,
              background: 'rgba(0,0,0,0.1)',
              padding: '2px 8px',
              borderRadius: '4px',
              cursor: 'text',
              minWidth: '100px',
              textAlign: 'center',
              border: '1px solid transparent'
            }}
            onMouseEnter={e => e.currentTarget.style.border = '1px solid rgba(255,255,255,0.3)'}
            onMouseLeave={e => e.currentTarget.style.border = '1px solid transparent'}
            title="Click to rename"
          >
            {title}
          </div>
        )}
      </div>

      {/* Right Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={() => exec('host.operation.history')} title="History" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: '11px', fontWeight: 500 }}>
          <Clock size={14} /> <span>History</span>
        </button>
        <button onClick={() => exec('host.operation.macros')} title="Macros" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: '11px', fontWeight: 500 }}>
          <Zap size={14} /> <span>Macros</span>
        </button>

        {/* Profile with Dropdown Menu */}
        <div ref={profileRef} style={{ position: 'relative' }}>
          {user ? (
            <div
              onClick={(e) => { e.stopPropagation(); setProfileMenuOpen(!profileMenuOpen); }}
              title={user.name || 'Profile'}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                background: profileMenuOpen ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.15)',
                padding: '2px 8px 2px 2px',
                borderRadius: '16px',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.25)'}
              onMouseLeave={e => { if (!profileMenuOpen) e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
            >
              <div style={{
                width: '24px', height: '24px',
                borderRadius: '50%',
                background: '#fff',
                color: getThemeColor(),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: '800', fontSize: '12px',
                border: '1px solid rgba(0,0,0,0.1)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
              }}>
                {user.name ? user.name.substring(0, 1).toUpperCase() : 'U'}
              </div>
              <span style={{ fontWeight: 600, fontSize: '12px', textShadow: '0 1px 1px rgba(0,0,0,0.1)' }}>{user.name}</span>
            </div>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setProfileMenuOpen(!profileMenuOpen); }}
              style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '11px' }}>
              Sign In
            </button>
          )}

          {/* Profile Dropdown Menu */}
          {profileMenuOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                top: '36px',
                right: 0,
                background: 'white',
                boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                borderRadius: '8px',
                minWidth: '200px',
                zIndex: 1002,
                color: '#333',
                padding: '4px 0',
                border: '1px solid #e5e7eb',
                overflow: 'hidden'
              }}
            >
              {profileMenuItems.map((item, idx) => {
                if ('divider' in item && item.divider) {
                  return <div key={`div-${idx}`} style={{ height: '1px', background: '#e5e7eb', margin: '4px 0' }} />;
                }
                return (
                  <div
                    key={item.label}
                    onClick={item.onClick}
                    style={{
                      padding: item.isHeader ? '10px 14px' : '8px 14px',
                      cursor: item.isHeader ? 'default' : 'pointer',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      color: (item as any).danger ? '#dc2626' : '#333',
                      fontWeight: item.isHeader ? 600 : 400,
                    }}
                    onMouseEnter={(e) => { if (!item.isHeader) e.currentTarget.style.background = (item as any).danger ? '#fef2f2' : '#f3f4f6'; }}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ opacity: 0.7, display: 'flex' }}>{item.icon}</span>
                    <div>
                      <div>{item.label}</div>
                      {item.isHeader && item.subtitle && (
                        <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400, marginTop: '2px' }}>
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
