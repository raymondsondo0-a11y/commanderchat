import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { MessageCircle, Search, Send, LogOut, Plus, Phone, Video, MoreVertical, CheckCheck, Paperclip, Smile, ArrowLeft, Users } from 'lucide-react';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
const initials = (name='User') => name.trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
const time = value => new Date(value).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});

export default function App() {
  const [session,setSession] = useState(null), [profile,setProfile] = useState(null);
  const [authMode,setAuthMode] = useState('login'), [email,setEmail] = useState(''), [password,setPassword] = useState(''), [fullName,setFullName] = useState('');
  const [authError,setAuthError] = useState(''), [busy,setBusy] = useState(false);
  const [chats,setChats] = useState([]), [active,setActive] = useState(null), [messages,setMessages] = useState([]);
  const [draft,setDraft] = useState(''), [search,setSearch] = useState(''), [people,setPeople] = useState([]), [showPeople,setShowPeople] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({data})=>setSession(data.session));
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event,s)=>setSession(s));
    return ()=>subscription.unsubscribe();
  },[]);
  useEffect(()=>{ if(session?.user) loadProfileAndChats(); else {setProfile(null);setChats([]);setActive(null);} },[session?.user?.id]);
  async function loadProfileAndChats(){
    const u=session.user;
    await supabase.from('profiles').upsert({id:u.id, display_name:u.user_metadata?.full_name || u.email?.split('@')[0] || 'Member'});
    const {data:me}=await supabase.from('profiles').select('*').eq('id',u.id).single(); setProfile(me);
    await loadChats();
  }
  async function loadChats(){
    const {data:members}=await supabase.from('conversation_members').select('conversation_id').eq('user_id',session.user.id);
    const ids=(members||[]).map(x=>x.conversation_id);
    if(!ids.length){setChats([]);return;}
    const {data:rows}=await supabase.from('conversation_members').select('conversation_id, profiles(id,display_name,avatar_url), conversations(id,updated_at)').in('conversation_id',ids).neq('user_id',session.user.id);
    const mapped=(rows||[]).map(r=>({id:r.conversation_id, person:r.profiles, updated_at:r.conversations?.updated_at})).filter(x=>x.person);
    const withLast=await Promise.all(mapped.map(async c=>{const {data:m}=await supabase.from('messages').select('content,created_at,sender_id').eq('conversation_id',c.id).order('created_at',{ascending:false}).limit(1).maybeSingle();return {...c,last:m};}));
    setChats(withLast.sort((a,b)=>new Date(b.last?.created_at||b.updated_at)-new Date(a.last?.created_at||a.updated_at)));
  }
  async function openChat(chat){
    setActive(chat); setShowPeople(false);
    const {data}=await supabase.from('messages').select('*').eq('conversation_id',chat.id).order('created_at');
    setMessages(data||[]);
    await supabase.from('messages').update({read_at:new Date().toISOString()}).eq('conversation_id',chat.id).neq('sender_id',session.user.id).is('read_at',null);
  }
  useEffect(()=>{
    if(!active||!supabase)return;
    const channel=supabase.channel('chat-'+active.id).on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:'conversation_id=eq.'+active.id},payload=>setMessages(prev=>prev.some(m=>m.id===payload.new.id)?prev:[...prev,payload.new])).subscribe();
    return ()=>{supabase.removeChannel(channel);};
  },[active?.id]);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:'smooth'});},[messages]);
  async function authenticate(e){
    e.preventDefault();setBusy(true);setAuthError('');
    const result=authMode==='signup'
      ? await supabase.auth.signUp({email,password,options:{data:{full_name:fullName}}})
      : await supabase.auth.signInWithPassword({email,password});
    if(result.error)setAuthError(result.error.message);
    else if(authMode==='signup'&&!result.data.session)setAuthError('Check your email to confirm your account, then sign in.');
    setBusy(false);
  }
  async function sendMessage(e){
    e.preventDefault();if(!draft.trim()||!active)return;
    const content=draft.trim();setDraft('');
    const {error}=await supabase.from('messages').insert({conversation_id:active.id,sender_id:session.user.id,content});
    if(error){setDraft(content);alert(error.message);}else loadChats();
  }
  async function loadPeople(){
    const {data}=await supabase.from('profiles').select('id,display_name,avatar_url').neq('id',session.user.id).order('display_name').limit(100);
    setPeople(data||[]);setShowPeople(true);
  }
  async function startChat(person){
    const {data,error}=await supabase.rpc('create_direct_conversation',{target_user:person.id});
    if(error){alert(error.message);return;}
    await loadChats(); const chat={id:data,person}; await openChat(chat);
  }
  async function signOut(){await supabase.auth.signOut();}
  const visibleChats=useMemo(()=>chats.filter(c=>(c.person?.display_name||'').toLowerCase().includes(search.toLowerCase())),[chats,search]);

  if(!supabase) return <div className="setup"><div className="setup-card"><div className="brand-mark"><MessageCircle/></div><h1>CommanderChat</h1><p>Connect your Supabase project to activate messaging.</p><code>VITE_SUPABASE_URL<br/>VITE_SUPABASE_ANON_KEY</code><p className="muted">Add these as environment variables in Vercel, then redeploy.</p></div></div>;
  if(!session) return <div className="auth-shell"><form className="auth-card" onSubmit={authenticate}><div className="brand-mark"><MessageCircle/></div><h1>CommanderChat</h1><p className="muted">Messages that bring us closer.</p>{authMode==='signup'&&<input placeholder="Your name" value={fullName} onChange={e=>setFullName(e.target.value)} required/>}<input type="email" placeholder="Email address" value={email} onChange={e=>setEmail(e.target.value)} required/><input type="password" placeholder="Password (at least 6 characters)" value={password} onChange={e=>setPassword(e.target.value)} minLength="6" required/>{authError&&<div className="error">{authError}</div>}<button className="primary full" disabled={busy}>{busy?'Please wait…':authMode==='login'?'Log in':'Create account'}</button><p className="switch">{authMode==='login'?"New to CommanderChat?":"Already have an account?"} <button type="button" onClick={()=>{setAuthMode(authMode==='login'?'signup':'login');setAuthError('')}}>{authMode==='login'?'Create account':'Log in'}</button></p></form></div>;

  return <main className="app-shell">
    <aside className={'sidebar '+(active?'hide-mobile':'')}>
      <header className="side-header"><div className="brand"><div className="brand-mark small"><MessageCircle/></div><strong>CommanderChat</strong></div><div className="header-actions"><button title="New chat" onClick={loadPeople}><Plus/></button><button title="Sign out" onClick={signOut}><LogOut/></button></div></header>
      <div className="my-profile"><div className="avatar self">{initials(profile?.display_name||session.user.email)}</div><div><b>{profile?.display_name||'My account'}</b><small>Available</small></div><span className="online-dot"/></div>
      <div className="search-box"><Search size={18}/><input placeholder="Search or start a new chat" value={search} onChange={e=>setSearch(e.target.value)}/></div>
      <div className="list-heading">{showPeople?'START A CONVERSATION':'CHATS'}{showPeople&&<button onClick={()=>setShowPeople(false)}>Back to chats</button>}</div>
      <div className="chat-list">
        {showPeople ? people.map(p=><button className="chat-row" key={p.id} onClick={()=>startChat(p)}><div className="avatar">{initials(p.display_name)}</div><div className="chat-info"><b>{p.display_name}</b><small>Start a conversation</small></div></button>)
        : visibleChats.map(c=><button className={'chat-row '+(active?.id===c.id?'selected':'')} key={c.id} onClick={()=>openChat(c)}><div className="avatar">{initials(c.person.display_name)}</div><div className="chat-info"><div className="chat-top"><b>{c.person.display_name}</b><small>{c.last?time(c.last.created_at):''}</small></div><small className="last-message">{c.last?.content||'Start chatting'}</small></div></button>)}
        {!showPeople&&!visibleChats.length&&<div className="empty-list"><MessageCircle/><b>No conversations yet</b><span>Start a chat with someone.</span><button className="primary" onClick={loadPeople}>New chat</button></div>}
      </div>
      <footer className="side-footer">Private conversations. Powered by Supabase.</footer>
    </aside>
    <section className={'conversation '+(!active?'empty-conversation':'')}>
      {active?<><header className="chat-header"><button className="back-button" onClick={()=>setActive(null)}><ArrowLeft/></button><div className="avatar">{initials(active.person?.display_name)}</div><div className="chat-person"><b>{active.person?.display_name}</b><small><i className="online-dot"/> conversation</small></div><div className="header-actions"><button title="Voice call (coming soon)"><Phone/></button><button title="Video call (coming soon)"><Video/></button><button title="More"><MoreVertical/></button></div></header>
        <div className="messages-area"><div className="date-pill">Today</div>{messages.map(m=><div key={m.id} className={'message-line '+(m.sender_id===session.user.id?'mine':'theirs')}><div className="bubble"><p>{m.content}</p><span>{time(m.created_at)} {m.sender_id===session.user.id&&<CheckCheck size={14}/>}</span></div></div>)}<div ref={bottomRef}/></div>
        <form className="composer" onSubmit={sendMessage}><button type="button" title="Emoji (coming soon)"><Smile/></button><button type="button" title="Attachments (coming soon)"><Paperclip/></button><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Type a message" autoComplete="off"/><button className="send-button" disabled={!draft.trim()}><Send/></button></form>
      </>:<div className="welcome"><div className="welcome-art"><MessageCircle size={66}/></div><h1>Welcome to CommanderChat</h1><p>Send and receive messages in real time.</p><span><Users size={15}/> Choose a conversation or start a new chat.</span></div>}
    </section>
  </main>;
}