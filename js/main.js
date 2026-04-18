// Shared navigation toggle
document.addEventListener("click", function (e) {
  var toggle = e.target.closest(".nav-toggle");
  if (toggle) return;
  var links = document.querySelector(".nav-links");
  if (links && links.classList.contains("open") && !e.target.closest(".nav-links")) {
    links.classList.remove("open");
  }
});
