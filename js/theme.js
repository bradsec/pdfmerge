(function () {
  const theme = localStorage.getItem("theme") || "light";
  document.body.setAttribute("data-theme", theme);
})();

document.addEventListener("DOMContentLoaded", () => {
  const themeSwitcher = document.getElementById("theme-switcher");

  function setTheme(theme) {
    const body = document.body;
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    const sunIcon = document.getElementById("sun-icon");
    const moonIcon = document.getElementById("moon-icon");

    if (theme === "dark") {
      body.setAttribute("data-theme", "dark");
      if (themeColorMeta) themeColorMeta.content = "#202020";
      if (sunIcon) sunIcon.style.display = "none";
      if (moonIcon) moonIcon.style.display = "block";
    } else {
      body.setAttribute("data-theme", "light");
      if (themeColorMeta) themeColorMeta.content = "#FFFFFF";
      if (sunIcon) sunIcon.style.display = "block";
      if (moonIcon) moonIcon.style.display = "none";
    }
  }

  function getCookieTheme() {
    const cookie = document.cookie
      .split("; ")
      .find((row) => row.startsWith("theme="));
    return cookie ? cookie.split("=")[1] : null;
  }

  const cookieTheme = getCookieTheme();
  const savedTheme = cookieTheme || localStorage.getItem("theme") || "light";
  setTheme(savedTheme);

  if (themeSwitcher) {
    themeSwitcher.addEventListener("click", () => {
      const body = document.body;
      const currentTheme = body.getAttribute("data-theme");
      const newTheme = currentTheme === "dark" ? "light" : "dark";
      setTheme(newTheme);
      localStorage.setItem("theme", newTheme);
      document.cookie = `theme=${newTheme}; path=/; max-age=31536000`;
    });
  }
});