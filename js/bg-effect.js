/**
 * Interactive Background Lines Effect
 * Adds a canvas to the body and draws particles with connecting lines
 * that react to mouse movement.
 */

(function initBgEffect() {
  // Create canvas element
  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.zIndex = '-1'; // Behind everything
  canvas.style.pointerEvents = 'none'; // Don't block clicks
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  
  let width, height;
  let particles = [];
  
  const mouse = { x: -1000, y: -1000 };
  
  // Configuration
  const PARTICLE_COUNT = 80;
  const CONNECT_DISTANCE = 120;
  const MOUSE_CONNECT_DISTANCE = 180;
  
  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    initParticles();
  }

  function initParticles() {
    particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: Math.random() * 1.5 + 0.5
      });
    }
  }

  window.addEventListener('resize', resize);
  
  // Track mouse position globally
  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  
  // Optional: hide effect when mouse leaves window
  window.addEventListener('mouseout', () => {
    mouse.x = -1000;
    mouse.y = -1000;
  });

  function draw() {
    ctx.clearRect(0, 0, width, height);
    
    // Update and draw particles
    for (let i = 0; i < particles.length; i++) {
      let p = particles[i];
      
      p.x += p.vx;
      p.y += p.vy;
      
      // Bounce off edges
      if (p.x < 0 || p.x > width) p.vx *= -1;
      if (p.y < 0 || p.y > height) p.vy *= -1;
      
      // Draw particle
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(99, 102, 241, 0.4)'; // Primary accent color (indigo)
      ctx.fill();
      
      // Connect to mouse
      const dxMouse = p.x - mouse.x;
      const dyMouse = p.y - mouse.y;
      const distMouse = Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse);
      
      if (distMouse < MOUSE_CONNECT_DISTANCE) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(mouse.x, mouse.y);
        const opacity = 1 - (distMouse / MOUSE_CONNECT_DISTANCE);
        ctx.strokeStyle = `rgba(168, 85, 247, ${opacity * 0.6})`; // Secondary accent color (purple)
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // Slight magnetic effect
        p.x -= dxMouse * 0.002;
        p.y -= dyMouse * 0.002;
      }
      
      // Connect to other particles
      for (let j = i + 1; j < particles.length; j++) {
        let p2 = particles[j];
        const dx = p.x - p2.x;
        const dy = p.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < CONNECT_DISTANCE) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          const opacity = 1 - (dist / CONNECT_DISTANCE);
          ctx.strokeStyle = `rgba(99, 102, 241, ${opacity * 0.2})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
    
    requestAnimationFrame(draw);
  }

  // Initialize
  resize();
  draw();
})();
