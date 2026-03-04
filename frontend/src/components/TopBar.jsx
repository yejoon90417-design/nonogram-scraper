import { ChevronDown, LogIn, User, UserPlus } from "lucide-react";

export function TopBar({ isLoggedIn, authUser, logout, openAuthScreen, isModeAuth }) {
  return (
    <div className="topBar">
      <div className="brandWrap">
        <div className="logoPixel" aria-hidden="true" />
        <h1 className="title">Nonogram Arena</h1>
      </div>

      {!isModeAuth && (
        <div className="topAuth">
          {isLoggedIn ? (
            <>
              <span className="userChip">
                {authUser.nickname} ({authUser.username})
              </span>
              <button onClick={logout}>로그아웃</button>
            </>
          ) : (
            <>
              <span className="guestIcon" aria-hidden="true">
                <User size={18} />
                <ChevronDown size={16} />
              </span>
              <button className="ghostBtn" onClick={() => openAuthScreen("login", "menu")}>
                <LogIn size={16} /> Login
              </button>
              <button className="primaryBtn" onClick={() => openAuthScreen("signup", "menu")}>
                <UserPlus size={16} /> Sign Up
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
