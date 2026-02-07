import { ICommandService, IUniverInstanceService, UserManagerService, UniverInstanceType } from '@univerjs/core';
import { useDependency } from '../../utils/di';
import React, { useEffect, useState } from 'react';
import { Undo2, Redo2, Save, Clock, Home, Menu } from 'lucide-react';

export function OnlyOfficeTitleBar() {
  const univerInstanceService = useDependency(IUniverInstanceService);
  const commandService = useDependency(ICommandService);
  const userManagerService = useDependency(UserManagerService);

  const [title, setTitle] = useState('Untitled.xlsx');
  const [user, setUser] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editVal, setEditVal] = useState('');

  // Menu State
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  // Unit Type State
  const [unitType, setUnitType] = useState<UniverInstanceType>(UniverInstanceType.UNIVER_SHEET);

  useEffect(() => {
    const update = () => {
      // Priorities: Sheet > Doc > Slide (or whatever is current)
      // Since we don't know which is active, we check all.
      const sheet = univerInstanceService.getCurrentUnitForType(UniverInstanceType.UNIVER_SHEET);
      const doc = univerInstanceService.getCurrentUnitForType(UniverInstanceType.UNIVER_DOC);
      const slide = univerInstanceService.getCurrentUnitForType(UniverInstanceType.UNIVER_SLIDE);

      if (sheet) {
        setUnitType(UniverInstanceType.UNIVER_SHEET);
        setTitle((sheet as any).getName?.() || 'Untitled.xlsx');
        // console.log('📊 [TitleBar] Detected Sheet:', (sheet as any).getName?.());
      } else if (doc) {
        setUnitType(UniverInstanceType.UNIVER_DOC);
        const name = (doc as any).getName?.() || (doc as any).getSnapshot?.()?.name || 'Untitled.docx';
        // console.log('📝 [TitleBar] Detected Doc:', name, doc);
        setTitle(name);
      } else if (slide) {
        setUnitType(UniverInstanceType.UNIVER_SLIDE);
        setTitle((slide as any).getName?.() || 'Untitled.pptx');
      } else {
        // console.log('⚠️ [TitleBar] No Unit Found');
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

    // 4. Close Menu
    const closeMenu = () => setActiveMenu(null);
    window.addEventListener('click', closeMenu);

    return () => {
      clearInterval(interval);
      sub.unsubscribe();
      window.removeEventListener('click', closeMenu);
    };
  }, [univerInstanceService, userManagerService]);

  const exec = (id: string, params?: any) => {
    commandService.executeCommand(id, params);
    setActiveMenu(null);
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
      { label: 'Undo', cmd: 'undo' },
      { label: 'Redo', cmd: 'redo' },
      { label: 'Copy', cmd: 'sheet.command.copy' },
      { label: 'Paste', cmd: 'sheet.command.paste' },
    ],
    View: [
      { label: 'Zoom In', cmd: 'sheet.command.set-zoom-ratio', icon: 'zoom-in' },
      { label: 'Zoom Out', cmd: 'sheet.command.zoom-out' },
    ]
  };

  const getMenuItems = () => {
    const menus: Record<string, Array<{ label: string, cmd?: string, icon?: any }>> = { ...APP_MENUS }; // Clone basic

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
        { label: 'Image', cmd: 'doc.command.insert-image' }, // Hypothetical
        { label: 'Page Break', cmd: 'doc.command.page-break' },
      ];
      menus['Format'] = [
        { label: 'Bold', cmd: 'doc.command.set-bold' }, // Hypothetical
        { label: 'Headers', cmd: 'doc.command.headers' },
      ];
      menus['References'] = [
        { label: 'Table of Contents', cmd: 'doc.command.toc' },
      ];
    } else if (unitType === UniverInstanceType.UNIVER_SLIDE) {
      menus['Insert'] = [
        { label: 'New Slide', cmd: 'slide.command.new-slide' }, // Hypothetical
        { label: 'Shape', cmd: 'slide.command.insert-shape' },
      ];
      menus['Slide Show'] = [
        { label: 'Start from Beginning', cmd: 'slide.command.play' },
      ];
    }

    return menus;
  };

  const MENU_ITEMS = getMenuItems();

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
        <button onClick={() => exec('host.operation.home')} title="Home" style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: 0.9, padding: '4px' }}>
          <Home size={16} />
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
                      onClick={() => exec(item.cmd || '')}
                      style={{
                        padding: '6px 16px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      {item.label}
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
          <button onClick={() => exec('undo')} title="Undo" style={{ padding: '4px', background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', borderRadius: '4px' }} className="hover:bg-white/10">
            <Undo2 size={16} />
          </button>
          <button onClick={() => exec('redo')} title="Redo" style={{ padding: '4px', background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', borderRadius: '4px' }} className="hover:bg-white/10">
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
            onClick={() => { setEditVal(title.replace(/\.xlsx$/, '')); setIsEditing(true); }}
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

        {user ? (
          <div
            onClick={() => exec('host.operation.logout')}
            title="Sign Out"
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'rgba(255,255,255,0.15)',
              padding: '2px 8px 2px 2px',
              borderRadius: '16px',
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.25)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
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
            onClick={() => exec('host.operation.logout')}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '11px' }}>
            Sign In
          </button>
        )}
      </div>
    </div>
  );
}
