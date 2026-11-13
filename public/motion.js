'use strict';
// Feedback local: não altera navegação, dados nem eventos dos formulários.
document.addEventListener('pointerdown',event=>{
 if(event.button!==0||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const target=event.target.closest('.btn,.iconbtn,.genre,.navlink,.mobile-nav .create');
 if(!target||target.disabled||target.getAttribute('aria-disabled')==='true')return;
 const box=target.getBoundingClientRect(),size=Math.max(box.width,box.height)*2;
 const ripple=document.createElement('span');ripple.className='click-ripple';ripple.setAttribute('aria-hidden','true');
 ripple.style.width=ripple.style.height=size+'px';
 ripple.style.left=event.clientX-box.left-size/2+'px';ripple.style.top=event.clientY-box.top-size/2+'px';
 target.classList.add('ripple-host');target.append(ripple);
 ripple.addEventListener('animationend',()=>ripple.remove(),{once:true});
 setTimeout(()=>ripple.remove(),800);
});
