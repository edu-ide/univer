import React from 'react';
import { Undo2, Redo2, Save } from 'lucide-react';

export function OnlyOfficeTitleBar() {
  return (
    <div 
      className="onlyoffice-title-bar"
      style={{
        height: '28px',
        backgroundColor: '#40865c', // OnlyOffice Green
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 8px',
        width: '100%',
        color: 'white',
        userSelect: 'none',
        position: 'relative',
        zIndex: 1000
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* QAT Icons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button style={{ padding: '4px', background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}><Save size={14} /></button>
            <button style={{ padding: '4px', background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}><Undo2 size={14} /></button>
            <button style={{ padding: '4px', background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}><Redo2 size={14} /></button>
        </div>
        {/* Title */}
        <div style={{ fontSize: '11px', fontWeight: 600 }}>Spreadsheet - Untitled.xlsx</div>
      </div>
    </div>
  );
}
