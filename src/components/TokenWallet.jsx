import { apiFetch } from '../api';
import { useEffect, useRef, useState } from 'react';
import './TokenWallet.css';

export default function TokenWallet({ user, onWalletChange }) {
  const [wallet,setWallet]=useState(null);
  const [error,setError]=useState('');
  const [bundle,setBundle]=useState(20);
  const [customAmount,setCustomAmount]=useState('');
  const dialog=useRef(null);
  useEffect(()=>{
    let cancelled=false;
    async function refresh() {
      try {
        const response=await apiFetch('/api/tokens',{headers:{Authorization:`Bearer ${user.sessionToken}`}});
        const data=await response.json();if(!response.ok)throw new Error(data.error);
        if(!cancelled){setWallet(data);onWalletChange(data);setError('');}
      }catch(error){if(!cancelled)setError(error.message);}
    }
    void refresh();const timer=setInterval(refresh,5000);
    return ()=>{cancelled=true;clearInterval(timer);};
  },[user.sessionToken,onWalletChange]);
  const amount=bundle==='custom'?Number(customAmount):bundle;
  const total=wallet && Number.isSafeInteger(amount) && amount>0 && Number.isSafeInteger(amount*wallet.pricePerTokenCents) ? amount*wallet.pricePerTokenCents : null;
  return <div className="token-wallet">
    <div><span className="token-wallet-label">Listing tokens</span><strong>{wallet?`${wallet.balance} tokens`:'Loading balance…'}</strong><small>{wallet?.nextListingCost===20?'Normal listing price: 20 tokens per listing.':'Your very first listing is discounted to 10 tokens. Normal price: 20 tokens per listing thereafter.'}</small></div>
    <button className="btn-secondary" onClick={()=>dialog.current.showModal()}>Purchase tokens</button>
    {error&&<p role="status">{error}</p>}
    <dialog className="token-purchase-dialog" ref={dialog}>
      <div className="token-dialog-heading"><div><h3>Purchase tokens</h3><p>R5 per token · Run listing ads in learners' feeds</p></div><button type="button" aria-label="Close token purchase" onClick={()=>dialog.current.close()}>×</button></div>
      <p className="token-cost-note">Your very first listing is discounted to 10 tokens. The normal price is 20 tokens per listing thereafter.</p>
      <fieldset><legend>Choose your bundle</legend><div className="token-bundles">{wallet?.bundles.map(item=><label key={item.tokens}><input type="radio" name="token-bundle" checked={bundle===item.tokens} onChange={()=>setBundle(item.tokens)}/><span><strong>{item.tokens} tokens</strong><small>R{(item.priceCents/100).toFixed(2)}</small></span></label>)}</div></fieldset>
      <div className="token-custom-amount"><label><input type="radio" name="token-bundle" checked={bundle==='custom'} onChange={()=>setBundle('custom')}/> Custom amount</label>{bundle==='custom'&&<label className="token-custom-input">Number of tokens<input type="number" min="1" step="1" value={customAmount} placeholder="e.g. 30" onChange={e=>setCustomAmount(e.target.value)}/><small>Whole tokens only · R5 each</small></label>}</div>
      <div className="token-purchase-total"><span>Total</span><strong>{total?`R${(total/100).toFixed(2)}`:'—'}</strong></div>
      <p className="token-payment-pending" role="status">Token checkout will use the same payment gateway as lesson bookings. Purchases will open once that gateway is connected.</p>
      <button className="btn-primary" disabled>Checkout coming soon</button>
    </dialog>
  </div>;
}
