import { useState } from 'react';
import InlineFeedback from './InlineFeedback';
import { packageLabel, packageValidity, sortOffers } from '../packages';
import './ListingForm.css';

export default function CreatePost({ user, wallet, activeCount=0, onAdd }) {
  const [title,setTitle]=useState('');
  const [content,setContent]=useState('');
  const [price,setPrice]=useState('');
  const [packageKey,setPackageKey]=useState('');
  const [busy,setBusy]=useState(false);
  const [feedback,setFeedback]=useState('');
  const [isSpecial,setIsSpecial]=useState(false);
  const [specialPrice,setSpecialPrice]=useState('');
  const [expiry,setExpiry]=useState('');
  const [extendSpecial,setExtendSpecial]=useState(false);
  const [expiryBase,setExpiryBase]=useState(()=>Date.now());
  const [specialCategory,setSpecialCategory]=useState('adult_individual');
  const [specialPack,setSpecialPack]=useState('single');
  const [specialDuration,setSpecialDuration]=useState('60');
  const coach=user?.role==='coach';
  const offerings=sortOffers(user?.ratesStructure?.offerings || []);
  const offer=offerings.find(o=>`${o.category}-${o.packSize}`===packageKey);
  const paidListing=coach || activeCount>=3;
  const cost=(paidListing ? wallet?.nextListingCost : 0) + (coach && isSpecial && extendSpecial ? 10 : 0);
  const maxExpiry = new Date(expiryBase + (extendSpecial ? 60 : 30) * 86400000 + 2 * 3600000).toISOString().slice(0,16);
  return <form className="listing-editor" onSubmit={async e=>{
    e.preventDefault();if(busy)return;
    if(coach&&!isSpecial&&!offer){setFeedback('Select one package to advertise.');return;}
    setBusy(true);setFeedback('');
    try {
      const saved=await onAdd({title,content,price:Number(price||0),expectedTokenCost:cost,category:offer?.category,packSize:offer?.packSize,isSpecial:coach&&isSpecial,extendSpecial:coach&&isSpecial&&extendSpecial,customOffer:coach&&isSpecial?{category:specialCategory,packSize:specialPack,durationMinutes:Number(specialDuration)}:undefined,specialPrice:Number(specialPrice),expiresAt:coach&&isSpecial&&expiry ? new Date(`${expiry}:00+02:00`).toISOString() : null});
      if(saved){setIsSpecial(false);setSpecialPrice('');setExpiry('');setExtendSpecial(false);}
      if(saved){setTitle('');setContent('');setPrice('');setPackageKey('');setFeedback('Your listing is now live.');}
    }catch {setFeedback('Unable to save your listing. Please try again.');}finally{setBusy(false);}
  }}>
    <InlineFeedback message={feedback} onDismiss={()=>setFeedback('')}/>
    <div className="listing-editor-guidance"><p className="listing-editor-info">{coach?'Advertise one offer per listing. Your first listing costs 10 tokens; later listings cost 20 tokens each.':'Keep up to 3 active listings free. Your first additional listing costs 5 tokens; later additional listings cost 10 tokens each.'}</p>
    {!coach&&<span className="listing-limit">{activeCount} active · {Math.max(0,3-activeCount)} free slots available</span>}
    </div>
    <fieldset disabled={busy}>
      {coach&&<div className="listing-type-choice" role="group" aria-label="Offer type"><button type="button" className="btn-secondary" aria-pressed={!isSpecial} onClick={()=>setIsSpecial(false)}>Existing package</button><button type="button" className="btn-secondary" aria-pressed={isSpecial} onClick={()=>{setIsSpecial(true);setExpiryBase(Date.now());}}>Special offer</button></div>}
      {coach&&!isSpecial&&<label>Package to advertise<select required value={packageKey} onChange={e=>setPackageKey(e.target.value)}><option value="">Choose one offer</option>{offerings.map(o=><option key={`${o.category}-${o.packSize}`} value={`${o.category}-${o.packSize}`}>{o.category.replaceAll('_',' · ')} · {packageLabel(o.packSize)} · {o.formattedRate}</option>)}</select></label>}
      {!coach&&<label>Listing title<input required maxLength={150} value={title} placeholder="e.g. Looking for a beginner golf coach" onChange={e=>setTitle(e.target.value)}/></label>}
      {coach&&!isSpecial&&offer&&<div className="listing-offer-preview"><strong>{offer.category.replaceAll('_',' · ').toUpperCase()}</strong><span>{packageLabel(offer.packSize)}</span><b>{offer.formattedRate}</b><small>{offer.durationMinutes} minutes per lesson</small><small>{packageValidity(offer.packSize)}</small></div>}
      {coach&&!isSpecial&&!offerings.length&&<p>Add a package in Edit profile or create a new special.</p>}
      {coach&&isSpecial&&<>
        <label>Lesson type<select value={specialCategory} onChange={e=>setSpecialCategory(e.target.value)}><option value="junior_individual">Junior · Individual</option><option value="adult_individual">Adult · Individual</option><option value="adult_group">Adult · Group</option></select></label>
        <label>Package<select value={specialPack} onChange={e=>setSpecialPack(e.target.value)}><option value="single">1 lesson</option><option value="pack_5">5 lessons</option><option value="pack_10">10 lessons</option></select></label>
        <label>Minutes per lesson<input type="number" required min="5" max="480" step="1" value={specialDuration} onChange={e=>setSpecialDuration(e.target.value)}/></label>
        <label>Special package price (ZAR)<input type="number" required min="0.01" step="0.01" value={specialPrice} onChange={e=>setSpecialPrice(e.target.value)}/></label>
        <label className="listing-special-toggle"><input type="checkbox" checked={extendSpecial} onChange={e=>{setExtendSpecial(e.target.checked);setExpiry('');}}/> Extend to 60 days · 10 extra tokens</label>
        <label>Special expires<input type="datetime-local" required max={maxExpiry} value={expiry} onChange={e=>setExpiry(e.target.value)}/><small>Up to {extendSpecial?60:30} days · South African time (SAST). Expired specials move to your listing history.</small></label>
      </>}
      <label>{coach?'About this offer':'What are you looking for?'}<textarea required maxLength={5000} rows={4} value={content} placeholder={coach?'Describe who this package is for and what learners can expect…':'Share your goals, preferred area and availability…'} onChange={e=>setContent(e.target.value)}/></label>
      {!coach&&<label>Budget (ZAR, optional)<input type="number" min="0" step="0.01" value={price} placeholder="e.g. 500" onChange={e=>setPrice(e.target.value)}/><small>Your preferred budget for lessons.</small></label>}
      {paidListing&&<div className="listing-editor-info">{wallet?<>Publishing cost: <strong>{cost} tokens</strong> · Balance: {wallet.balance} tokens{wallet.balance<cost&&<p>Use the wallet above to purchase tokens.</p>}</>:'Checking publishing cost…'}</div>}
      <button className="btn-primary" disabled={busy||(paidListing&&(!wallet||wallet.balance<cost))||(coach&&!isSpecial&&!offer)}>{busy?'Publishing…':paidListing?`Publish · ${wallet ? cost : '…'} tokens`:'Publish free listing'}</button>
    </fieldset>
  </form>;
}
