const response = await fetch("/api/items");
const items = await response.json();
document.querySelector("#items").replaceChildren(...items.map((item) => {
  const element = document.createElement("li");
  element.textContent = item.title;
  return element;
}));
