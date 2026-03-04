import { motion } from "framer-motion";

export function MainMenu({ goSingleMode, goMultiMode, isLoggedIn }) {
  return (
    <section className="menuStage">
      <div className="modeChooser">
        <motion.button
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.98 }}
          className="modeBtn modeSingle"
          onClick={goSingleMode}
        >
          <span className="modeName">SINGLE PLAYER</span>
        </motion.button>
        <motion.button
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.98 }}
          className="modeBtn modeMulti"
          onClick={goMultiMode}
        >
          {!isLoggedIn && <span className="modeTag">Login Required</span>}
          <span className="modeName">MULTI PLAYER</span>
        </motion.button>
      </div>
      <div className="menuDust menuDustA" />
      <div className="menuDust menuDustB" />
      <div className="menuDust menuDustC" />
    </section>
  );
}
