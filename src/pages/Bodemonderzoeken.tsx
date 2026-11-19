// Bodemonderzoeken: dezelfde opzet als Schouwafspraken (map per plaats → week → tijdvakken invullen),
// met de naam van de bewoner verplicht en de planning in het sjabloon van de opdrachtgever.
import { Schouwafspraken } from "./Schouwafspraken";

export function Bodemonderzoeken() {
  return <Schouwafspraken soort="bodem" />;
}
