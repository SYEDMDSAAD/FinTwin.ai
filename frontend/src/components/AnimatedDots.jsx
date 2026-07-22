import { useState, useEffect } from "react";

// Cycling "." ".." "..." — used next to "Creating..." labels on AI-generation buttons.
function AnimatedDots() {
  const [count, setCount] = useState(1);
  useEffect(() => {
    const t = setInterval(() => setCount(c => (c % 3) + 1), 400);
    return () => clearInterval(t);
  }, []);
  return <span>{".".repeat(count)}</span>;
}

export default AnimatedDots;
