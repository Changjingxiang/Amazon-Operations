import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function AddModelModal({ open, onClose, onSubmit }) {
  const [modelName, setModelName] = useState('');
  const [parentAsin, setParentAsin] = useState('');
  const [site, setSite] = useState('加拿大站点');
  useEffect(() => {
    if (open) { setModelName(''); setParentAsin(''); setSite('加拿大站点'); }
  }, [open]);
  if (!open) return null;
  const valid = modelName.trim() && /^B0[A-Z0-9]{8}$/i.test(parentAsin.trim());
  return (
    <div className="modal-backdrop">
      <section className="add-model-modal" role="dialog" aria-modal="true" aria-label="新增型号">
        <div className="drawer-header"><h2>新增型号</h2><button type="button" onClick={onClose}><X /></button></div>
        <p>登记后会自动生成看板、历史、自然矩阵、SP矩阵和ABA月榜。</p>
        <label>产品名称<input value={modelName} onChange={(event) => setModelName(event.target.value)} placeholder="例如：LT25M1417 竹纤维背心" /></label>
        <label>父体 ASIN<input value={parentAsin} onChange={(event) => setParentAsin(event.target.value.toUpperCase())} placeholder="B0XXXXXXXX" maxLength={10} /></label>
        <label>站点<input value={site} onChange={(event) => setSite(event.target.value)} /></label>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>取消</button><button type="button" className="primary-button" disabled={!valid} onClick={() => onSubmit({ modelName: modelName.trim(), parentAsin: parentAsin.trim().toUpperCase(), site: site.trim() })}>保存并生成</button></div>
      </section>
    </div>
  );
}
