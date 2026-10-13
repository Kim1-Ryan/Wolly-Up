import { apiFetch } from '../api';
import React, { useCallback, useEffect, useState } from 'react';
export default function IdentityVerification({ token, onStatus }) {
 const [status,setStatus]=useState(null),[error,setError]=useState(''),[link,setLink]=useState(''),[busy,setBusy]=useState(false);
 const refresh=useCallback(async()=>{try{const r=await apiFetch('/api/verification',{headers:{Authorization:'Bearer '+token}});const d=await r.json();if(!r.ok)throw Error(d.error);setStatus(d);setError('');onStatus(d.isVerified);}catch(e){setError(e.message);}},[token,onStatus]);
 useEffect(()=>{void refresh();window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh);},[refresh]);
 return <section className="identity-verification-card"><div className="identity-verification-details"><h3>Verify your identity</h3><p>Confirm your identity with Persona. Your identity document and selfie are submitted directly to Persona.</p>
 {status&&<p><strong>{status.isVerified?'✓ Identity verified':status.status==='approved'?'Sandbox verification passed — test only':'Status: '+status.status.replaceAll('_',' ')}</strong></p>}
 {status&&!status.configured&&<p>Identity verification will be available once setup is complete. Your account is currently unverified.</p>}
 {error&&<p role="status">{error}</p>}
 </div><div className="identity-verification-actions">
 {!status?.isVerified&&<button className="btn-primary" disabled={busy} onClick={async()=>{setBusy(true);try{const r=await apiFetch('/api/verification',{method:'POST',headers:{Authorization:'Bearer '+token}});const d=await r.json();if(!r.ok)throw Error(d.error);setLink(d.url);setError('');}catch(e){setError(e.message);}finally{setBusy(false);}}}>{busy?'Preparing…':'Get verified'}</button>}
 {link&&<p><a href={link} target="_blank" rel="noopener noreferrer">Continue securely with Persona ↗</a></p>}
 {status?.configured&&<button className="btn-secondary" onClick={refresh}>Check verification status</button>}</div></section>;
}
