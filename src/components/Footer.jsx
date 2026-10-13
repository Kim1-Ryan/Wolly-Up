import React from "react";

function Footer() {
  // Dynamically parses the operational system calendar baseline timestamp metrics
  const currentYear = new Date().getFullYear();

  return (
    <footer className="global-app-footer">
      <p>Copyright © {currentYear} Wolly-Up. All Rights Reserved.</p>
    </footer>
  );
}

export default Footer;
