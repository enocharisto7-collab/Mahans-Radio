(function () {
  'use strict';
  const cfg = window.MAHANS_CONFIG || {};
  const client = window.supabase && cfg.url && cfg.publishableKey
    ? window.supabase.createClient(cfg.url, cfg.publishableKey)
    : null;
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let currentUser = null;
  let activeTab = 'overview';
  let editingId = null;
  const types = {programme:'Programmes',presenter:'Presenters',news:'News',podcast:'Podcasts',advertisement:'Advertisements'};
  const statusText = (s) => ({draft:'Draft',published:'Published',archived:'Archived',new:'New',read:'Read',replied:'Replied'}[s] || s);

  function status(el, msg, bad) {
    if (!el) return;
    el.textContent = msg;
    el.style.color = bad ? '#b33b25' : '#65752a';
  }
  function openAdmin() {
    if (!$('adminModal')) return;
    $('adminModal').classList.add('open');
    $('adminModal').setAttribute('aria-hidden','false');
    if (location.hash !== '#admin') history.replaceState(null,'','#admin');
  }
  function closeAdmin() {
    $('adminModal').classList.remove('open');
    $('adminModal').setAttribute('aria-hidden','true');
    if (location.hash === '#admin') history.replaceState(null,'',location.pathname + location.search);
  }
  function showLogin(message) {
    $('authPanel').hidden = false;
    $('dashboard').hidden = true;
    status($('authStatus'), message || 'Sign in with your Mahans Radio administrator account.', true);
  }
  async function verifyAdmin(user) {
    const {data, error} = await client.from('profiles').select('role,full_name').eq('id',user.id).maybeSingle();
    if (error) throw error;
    if (!data || data.role !== 'admin') throw new Error('This account is not marked as an administrator. Ask the project owner to assign the admin role in Supabase Profiles.');
    return data;
  }
  async function signIn(ev) {
    ev.preventDefault();
    if (!client) return status($('authStatus'),'Website database configuration is missing.',true);
    const form = new FormData(ev.currentTarget);
    const email = String(form.get('email') || '').trim();
    const password = String(form.get('password') || '');
    const btn = ev.currentTarget.querySelector('button[type="submit"]');
    btn.disabled = true; status($('authStatus'),'Signing in…');
    try {
      const {data,error} = await client.auth.signInWithPassword({email,password});
      if (error) throw error;
      currentUser = data.user;
      await verifyAdmin(currentUser);
      $('authPanel').hidden = true; $('dashboard').hidden = false;
      await renderTab('overview');
    } catch (e) {
      await client.auth.signOut();
      currentUser = null;
      status($('authStatus'),e.message || 'Sign in failed.',true);
    } finally { btn.disabled = false; }
  }
  async function signOut() {
    if (client) await client.auth.signOut();
    currentUser = null; showLogin('You have signed out.');
  }
  async function countRows(table, filters) {
    let q = client.from(table).select('id',{count:'exact',head:true});
    (filters || []).forEach(([col,op,val]) => { q = q[op](col,val); });
    const {count,error} = await q;
    if (error) throw error;
    return count || 0;
  }
  async function renderOverview() {
    const [published, drafts, messages, ads] = await Promise.all([
      countRows('mahans_content',[['status','eq','published']]),
      countRows('mahans_content',[['status','eq','draft']]),
      countRows('mahans_messages',[['status','eq','new']]),
      countRows('mahans_content',[['content_type','eq','advertisement']])
    ]);
    $('dashContent').innerHTML =
      '<div class="dash-grid"><div class="stat"><b>'+published+'</b><small>Published items</small></div>'+
      '<div class="stat"><b>'+drafts+'</b><small>Drafts waiting</small></div>'+
      '<div class="stat"><b>'+messages+'</b><small>New listener messages</small></div>'+
      '<div class="stat"><b>'+ads+'</b><small>Advertising records</small></div></div>'+
      '<div class="dash-file" style="margin-top:18px"><b>Welcome to Mahans Radio Control Room</b>'+
      '<p class="dash-help">Manage programmes, presenters, newsroom posts, podcasts, advertising records, media files and listener requests. Only an authorised administrator can access these tools.</p></div>';
  }
  function contentForm(row) {
    row = row || {};
    const opts = Object.keys(types).map(k => '<option value="'+k+'" '+(row.content_type===k?'selected':'')+'>'+types[k]+'</option>').join('');
    return '<form id="contentForm" class="dash-form">'+
      '<label>Content category<select name="content_type">'+opts+'</select></label>'+
      '<label>Title<input name="title" required maxlength="180" value="'+esc(row.title)+'" placeholder="Enter title"></label>'+
      '<label>Short description<textarea name="summary" rows="2" maxlength="600" placeholder="Short summary">'+esc(row.summary)+'</textarea></label>'+
      '<label>Full details<textarea name="body" rows="3" placeholder="Additional information">'+esc(row.body)+'</textarea></label>'+
      '<label>Presenter / contact<input name="presenter" value="'+esc(row.presenter)+'" placeholder="Presenter name (optional)"></label>'+
      '<label>Programme time / schedule<input name="schedule_text" value="'+esc(row.schedule_text)+'" placeholder="e.g. Weekdays, 6am–9am"></label>'+
      '<label>Image URL<input name="image_url" value="'+esc(row.image_url)+'" placeholder="Paste uploaded image URL"></label>'+
      '<label>Audio / video URL<input name="media_url" value="'+esc(row.media_url)+'" placeholder="Optional media link"></label>'+
      '<label>Publishing status<select name="status"><option value="draft" '+(row.status==='draft'||!row.status?'selected':'')+'>Draft</option><option value="published" '+(row.status==='published'?'selected':'')+'>Published</option><option value="archived" '+(row.status==='archived'?'selected':'')+'>Archived</option></select></label>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-lime" type="submit">'+(row.id?'SAVE CHANGES':'ADD CONTENT')+'</button>'+(row.id?'<button class="btn btn-outline" type="button" id="cancelEdit">CANCEL</button>':'')+'</div>'+
      '<small id="contentStatus"></small></form>';
  }
  async function renderContent() {
    const {data,error} = await client.from('mahans_content').select('*').order('created_at',{ascending:false}).limit(100);
    if (error) throw error;
    $('dashContent').innerHTML = '<h3>Publish station content</h3><p class="dash-help">Create and update programmes, presenters, news, podcasts and advertising records. Set an item to Published to make it eligible for the public website.</p>'+
      contentForm(editingId ? (data || []).find(x=>x.id===editingId) : null)+
      '<h3 style="margin-top:24px">Content library</h3><div class="dash-list">'+(data || []).map(x=>
        '<div class="dash-item"><span><b>'+esc(x.title)+'</b><br><small>'+esc(types[x.content_type]||x.content_type)+' · '+esc(statusText(x.status))+'</small></span>'+
        '<span style="display:flex;gap:6px;align-items:center"><button type="button" data-edit="'+x.id+'">Edit</button><button type="button" data-delete="'+x.id+'">Delete</button></span></div>'
      ).join('')+'</div>';
    $('contentForm').addEventListener('submit',saveContent);
    if ($('cancelEdit')) $('cancelEdit').addEventListener('click',()=>{editingId=null;renderContent();});
    $('dashContent').querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>{editingId=b.dataset.edit;renderContent();}));
    $('dashContent').querySelectorAll('[data-delete]').forEach(b=>b.addEventListener('click',()=>deleteContent(b.dataset.delete)));
  }
  async function saveContent(ev) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const row = {};
    ['content_type','title','summary','body','presenter','schedule_text','image_url','media_url','status'].forEach(k=>row[k]=String(f.get(k)||'').trim() || null);
    row.created_by = currentUser.id;
    row.updated_at = new Date().toISOString();
    const {error} = editingId
      ? await client.from('mahans_content').update(row).eq('id',editingId)
      : await client.from('mahans_content').insert(row);
    if (error) return status($('contentStatus'),error.message,true);
    editingId=null; await renderContent();
  }
  async function deleteContent(id) {
    if (!confirm('Delete this station content item?')) return;
    const {error} = await client.from('mahans_content').delete().eq('id',id);
    if (error) alert(error.message); else {editingId=null;await renderContent();}
  }
  async function renderUploads() {
    const {data,error} = await client.from('mahans_media').select('*').order('created_at',{ascending:false}).limit(80);
    if (error) throw error;
    $('dashContent').innerHTML = '<h3>Upload station media</h3><p class="dash-help">Images, audio, video and PDF files are stored in the Mahans Radio media bucket. Maximum file size: 100 MB.</p>'+
      '<form id="uploadForm" class="dash-form dash-file"><input type="file" name="file" accept="image/*,audio/*,video/mp4,application/pdf" required><button class="btn btn-lime" type="submit">UPLOAD FILE</button><small id="uploadStatus"></small></form>'+
      '<h3 style="margin-top:22px">Uploaded files</h3><div class="dash-list">'+(data||[]).map(x=>
      '<div class="dash-item"><span><b>'+esc(x.file_name)+'</b><br><small>'+esc(x.mime_type||'file')+' · '+Math.round((x.file_size||0)/1024)+' KB</small><br><a href="'+esc(x.public_url)+'" target="_blank" rel="noopener">Open file</a></span><button type="button" data-copy="'+esc(x.public_url)+'">Copy URL</button></div>'
      ).join('')+'</div>';
    $('uploadForm').addEventListener('submit',uploadFile);
    $('dashContent').querySelectorAll('[data-copy]').forEach(b=>b.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(b.dataset.copy);b.textContent='Copied';}catch(e){prompt('Copy this URL',b.dataset.copy);}}));
  }
  async function uploadFile(ev) {
    ev.preventDefault();
    const file = new FormData(ev.currentTarget).get('file');
    if (!file || !file.size) return;
    if (file.size > 100*1024*1024) return status($('uploadStatus'),'File is larger than 100 MB.',true);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    const path = currentUser.id+'/'+Date.now()+'-'+safeName;
    status($('uploadStatus'),'Uploading…');
    const {error:upError} = await client.storage.from('mahans-radio-media').upload(path,file,{upsert:false,contentType:file.type||'application/octet-stream'});
    if (upError) return status($('uploadStatus'),upError.message,true);
    const {data:{publicUrl}} = client.storage.from('mahans-radio-media').getPublicUrl(path);
    const {error} = await client.from('mahans_media').insert({file_name:file.name,file_path:path,public_url:publicUrl,mime_type:file.type,file_size:file.size,created_by:currentUser.id});
    if (error) return status($('uploadStatus'),'Uploaded, but media record could not be saved: '+error.message,true);
    await renderUploads();
  }
  async function renderRequests() {
    const {data,error} = await client.from('mahans_messages').select('*').order('created_at',{ascending:false}).limit(100);
    if (error) throw error;
    $('dashContent').innerHTML = '<h3>Listener inbox</h3><p class="dash-help">Messages sent through the public website appear here.</p><div class="dash-list">'+(data||[]).map(x=>
      '<div class="dash-item" style="display:block"><div style="display:flex;justify-content:space-between;gap:10px"><b>'+esc(x.name)+' · '+esc(x.request_type)+'</b><small>'+esc(statusText(x.status))+'</small></div>'+
      '<p>'+esc(x.message)+'</p><small>'+esc(x.phone||'No phone number')+' · '+new Date(x.created_at).toLocaleString()+'</small>'+
      '<div style="margin-top:9px;display:flex;gap:7px;flex-wrap:wrap"><button data-message="'+x.id+'" data-status="read">Mark read</button><button data-message="'+x.id+'" data-status="replied">Mark replied</button><button data-message="'+x.id+'" data-status="archived">Archive</button></div></div>'
    ).join('')+'</div>';
    $('dashContent').querySelectorAll('[data-message]').forEach(b=>b.addEventListener('click',async()=>{const {error:e}=await client.from('mahans_messages').update({status:b.dataset.status}).eq('id',b.dataset.message);if(e)alert(e.message);else renderRequests();}));
  }
  async function renderSettings() {
    const {data,error} = await client.from('mahans_settings').select('*').eq('setting_key','station_profile').maybeSingle();
    if (error) throw error;
    const v = data && data.setting_value || {};
    $('dashContent').innerHTML = '<h3>Station settings</h3><p class="dash-help">Update public station details and the stream address used by the player.</p>'+
      '<form id="settingsForm" class="dash-form">'+
      '<label>Station name<input name="station_name" value="'+esc(v.station_name||'Mahans Radio')+'"></label>'+
      '<label>Frequency<input name="frequency" value="'+esc(v.frequency||'97.9 FM')+'"></label>'+
      '<label>Location<input name="location" value="'+esc(v.location||'Ajumako, Central Region, Ghana')+'"></label>'+
      '<label>WhatsApp number<input name="whatsapp" value="'+esc(v.whatsapp||'0598294528')+'"></label>'+
      '<label>Live MP3 stream URL<input name="stream_url" value="'+esc(v.stream_url||'http://135.181.212.132:6950/radio.mp3')+'"></label>'+
      '<button class="btn btn-lime" type="submit">SAVE SETTINGS</button><small id="settingsStatus"></small></form>';
    $('settingsForm').addEventListener('submit',async ev=>{ev.preventDefault();const f=new FormData(ev.currentTarget);const value={};['station_name','frequency','location','whatsapp','stream_url'].forEach(k=>value[k]=String(f.get(k)||'').trim());const {error:e}=await client.from('mahans_settings').upsert({setting_key:'station_profile',setting_value:value,updated_by:currentUser.id,updated_at:new Date().toISOString()});if(e)status($('settingsStatus'),e.message,true);else{status($('settingsStatus'),'Settings saved.');loadStationSettings();}});
  }
  async function renderTab(tab) {
    activeTab=tab;
    document.querySelectorAll('.dash-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
    $('dashContent').innerHTML='<p class="dash-help">Loading…</p>';
    try {
      if(tab==='overview') await renderOverview();
      else if(tab==='content') await renderContent();
      else if(tab==='upload') await renderUploads();
      else if(tab==='requests') await renderRequests();
      else if(tab==='settings') await renderSettings();
    } catch(e) {$('dashContent').innerHTML='<p class="dash-help" style="color:#b33b25">Could not load this section: '+esc(e.message)+'</p>';}
  }
  async function loadStationSettings() {
    if (!client) return;
    const {data} = await client.from('mahans_settings').select('setting_value').eq('setting_key','station_profile').maybeSingle();
    const s = data && data.setting_value;
    if (s && s.stream_url && $('radio')) $('radio').src=s.stream_url;
    if (s && s.station_name) document.querySelectorAll('.player-track b').forEach(x=>x.textContent=s.station_name);
    if (s && s.frequency) document.querySelectorAll('.hero-meta b').forEach((x,i)=>{if(i===0)x.textContent=s.frequency;});
  }
  async function loadPublicContent() {
    if (!client) return;
    const {data,error}=await client.from('mahans_content').select('*').eq('status','published').order('created_at',{ascending:false}).limit(40);
    if(error || !data) return;
    const groups={programme:$('programmes'),news:$('newsGrid')};
    ['programme','news'].forEach(type=>{
      const rows=data.filter(x=>x.content_type===type);
      if(!rows.length || !groups[type]) return;
      groups[type].innerHTML=rows.map(x=> type==='programme'
        ? '<article class="show-card"><div class="show-art art-music"><span>♫</span><label>'+esc(x.schedule_text||'ON AIR')+'</label></div><div class="show-info"><small>'+esc(x.presenter||'MAHANS RADIO')+'</small><h3>'+esc(x.title)+'</h3><p>'+esc(x.summary||'')+'</p></div></article>'
        : '<article class="news-card"><div class="news-art">📰</div><small>MAHANS NEWS</small><h3>'+esc(x.title)+'</h3><p>'+esc(x.summary||'')+'</p></article>'
      ).join('');
    });
  }
  function wirePublic() {
    $('openAdmin')?.addEventListener('click',openAdmin);
    $('closeAdmin')?.addEventListener('click',closeAdmin);
    $('adminModal')?.addEventListener('click',e=>{if(e.target===$('adminModal'))closeAdmin();});
    $('loginForm')?.addEventListener('submit',signIn);
    $('logoutBtn')?.addEventListener('click',signOut);
    document.querySelectorAll('.dash-tabs button').forEach(b=>b.addEventListener('click',()=>renderTab(b.dataset.tab)));
    $('hamb')?.addEventListener('click',()=>$('navLinks').classList.toggle('open'));
    $('year') && ($('year').textContent=new Date().getFullYear());
    const audio=$('radio'), play=$('playBtn');
    if(audio && play){
      if(!audio.src) audio.src=cfg.streamUrl || 'http://135.181.212.132:6950/radio.mp3';
      play.addEventListener('click',async()=>{
        if(audio.paused){try{await audio.play();play.textContent='Ⅱ';status($('streamStatus'),'Connecting to the live stream…');}catch(e){status($('streamStatus'),'Playback could not start. The HTTP stream may be blocked on this HTTPS website.',true);}}
        else{audio.pause();play.textContent='▶';status($('streamStatus'),'Playback paused.');}
      });
      audio.addEventListener('playing',()=>status($('streamStatus'),'You are listening to Mahans Radio live.'));
      audio.addEventListener('error',()=>{play.textContent='▶';status($('streamStatus'),'Stream could not be reached. Check the station MP3 stream or use an HTTPS stream.',true);});
      audio.addEventListener('pause',()=>{if(play)play.textContent='▶';});
    }
    $('requestForm')?.addEventListener('submit',async ev=>{
      ev.preventDefault();const f=new FormData(ev.currentTarget);
      const item={name:String(f.get('name')||'').trim(),phone:String(f.get('phone')||'').trim(),request_type:String(f.get('type')||'General message'),message:String(f.get('message')||'').trim()};
      if(client){const {error}=await client.from('mahans_messages').insert(item);if(!error){status($('requestStatus'),'Thank you. Your message has been sent to the station team.');ev.currentTarget.reset();return;}}
      const text='Hello Mahans Radio. Name: '+item.name+'. Phone: '+item.phone+'. Type: '+item.request_type+'. Message: '+item.message;
      window.open('https://wa.me/233598294528?text='+encodeURIComponent(text),'_blank','noopener');
      status($('requestStatus'),'Opening WhatsApp so you can send your message.');
    });
    if(location.hash==='#admin') openAdmin();
  }
  document.addEventListener('DOMContentLoaded',()=>{
    wirePublic();
    if(client){loadStationSettings();loadPublicContent();}
    else {showLogin('Dashboard connection is not configured yet.');}
  });
})();