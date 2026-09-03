/** Algoritmo con el que arranca la app la primera vez. */
export const EJEMPLO_INICIAL = `Proceso calificaciones
   Definir i, n Como Entero
   Definir suma, promedio Como Real

   Escribir "¿Cuántas calificaciones vas a capturar?"
   Leer n

   Dimension notas[100]
   suma <- 0

   Para i <- 1 Hasta n Hacer
      Escribir "Calificación ", i, ": " Sin Saltar
      Leer notas[i]
      suma <- suma + notas[i]
   FinPara

   promedio <- suma / n

   Si promedio >= 70 Entonces
      Escribir "Aprobado con ", promedio
   SiNo
      Escribir "Reprobado con ", promedio
   FinSi
FinProceso`;
