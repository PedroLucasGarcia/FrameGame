document.getElementById("levels-link").addEventListener("click", function() {
    var levelSelect = document.getElementById("level-select");
    if (levelSelect.style.display === "block") {
        levelSelect.style.display = "none";
    } else {
        levelSelect.style.display = "block";
    }
});