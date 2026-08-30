export default function StatusBadge({status}){const s=status||'—';return <span className={'status-badge s-'+String(s).toLowerCase()}><i/>{s}</span>}
