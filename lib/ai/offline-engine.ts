import type { AiChatRequest } from "@/lib/validation/schemas/ai.schemas";

export interface ChatSink {
  write(event: string, data: string): void;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function generateCustomUml(prompt: string): string {
  const p = prompt.toLowerCase();

  // 1. BANKING & FINTECH
  if (p.match(/bank|atm|loan|wallet|fintech|payment|transaction|credit card|mortgage/)) {
    return `classDiagram
    class Customer {
        +UUID customerId PK
        +String fullName
        +String kycStatus
        +String email UK
        +createAccount()
        +applyForLoan()
    }
    class BankAccount {
        +String accountNumber PK
        +UUID customerId FK
        +Decimal balance
        +String accountType
        +deposit(amount)
        +withdraw(amount)
    }
    class Transaction {
        +UUID transactionId PK
        +String sourceAccount FK
        +String targetAccount FK
        +Decimal amount
        +String txType
        +DateTime timestamp
        +executeTransaction()
    }
    class Loan {
        +UUID loanId PK
        +UUID customerId FK
        +Decimal principalAmount
        +Float interestRate
        +String status
        +calculateEMI()
    }
    class AuditLedger {
        +UUID ledgerId PK
        +UUID transactionId FK
        +Decimal debit
        +Decimal credit
        +recordEntry()
    }
    Customer "1" -- "1..*" BankAccount : owns
    BankAccount "1" -- "0..*" Transaction : logs
    Customer "1" -- "0..*" Loan : applies_for
    Transaction "1" -- "2" AuditLedger : double_entry_reconciles`;
  }

  // 2. CRYPTO & BLOCKCHAIN
  if (p.match(/crypto|blockchain|bitcoin|ethereum|nft|token|smart contract|defi|web3/)) {
    return `classDiagram
    class Wallet {
        +String publicAddress PK
        +String privateKeyHash
        +Decimal cryptoBalance
        +signTransaction()
        +getBalance()
    }
    class Block {
        +Integer blockNumber PK
        +String previousHash
        +String merkleRoot
        +Integer nonce
        +DateTime timestamp
        +mineBlock()
        +validateHash()
    }
    class CryptoTransaction {
        +String txHash PK
        +String senderAddress FK
        +String recipientAddress FK
        +Decimal gasFee
        +Decimal value
        +verifySignature()
    }
    class SmartContract {
        +String contractAddress PK
        +String bytecode
        +String stateVariables
        +executeFunction()
    }
    Wallet "1" -- "0..*" CryptoTransaction : signs
    Block "1" *-- "1..*" CryptoTransaction : contains
    SmartContract "1" -- "0..*" CryptoTransaction : invokes`;
  }

  // 3. AIRLINE & FLIGHT RESERVATION
  if (p.match(/airline|flight|airport|plane|aviation|boarding|ticket booking|pilot/)) {
    return `classDiagram
    class Passenger {
        +UUID passengerId PK
        +String passportNumber UK
        +String fullName
        +bookFlight()
        +checkIn()
    }
    class Flight {
        +String flightNumber PK
        +String originAirport
        +String destinationAirport
        +DateTime departureTime
        +DateTime arrivalTime
        +updateStatus()
    }
    class Aircraft {
        +String tailNumber PK
        +String model
        +Integer seatingCapacity
    }
    class BoardingPass {
        +UUID passId PK
        +String flightNumber FK
        +UUID passengerId FK
        +String seatNumber
        +String gateNumber
        +generateBarcode()
    }
    class AirlineStaff {
        +UUID staffId PK
        +String role
        +assignCrew()
    }
    Passenger "1" -- "0..*" BoardingPass : issued_to
    Flight "1" -- "1" Aircraft : assigned_to
    Flight "1" *-- "1..*" BoardingPass : manifests
    Flight "1" -- "1..*" AirlineStaff : crewed_by`;
  }

  // 4. RAILWAY & METRO / TRAIN TRANSIT
  if (p.match(/railway|train|metro|subway|irctc|locomotive|coach|rail/)) {
    return `classDiagram
    class Passenger {
        +UUID passengerId PK
        +String aadharNumber
        +String name
        +reserveSeat()
    }
    class Train {
        +String trainNumber PK
        +String trainName
        +String sourceStation
        +String destStation
        +getSchedule()
    }
    class Coach {
        +UUID coachId PK
        +String trainNumber FK
        +String coachClass
        +Integer totalSeats
    }
    class TicketPNR {
        +String pnrNumber PK
        +String trainNumber FK
        +UUID passengerId FK
        +String seatNumber
        +String status
        +cancelTicket()
    }
    class Station {
        +String stationCode PK
        +String stationName
        +Integer platformCount
    }
    Train "1" *-- "1..*" Coach : composed_of
    Passenger "1" -- "0..*" TicketPNR : books
    Train "1" -- "0..*" TicketPNR : allocated_to
    Station "1" -- "0..*" Train : halts_at`;
  }

  // 5. HOSPITAL & CLINIC MANAGEMENT
  if (p.match(/hospital|clinic|doctor|patient|medical|healthcare|surgery|radiology|telemedicine/)) {
    return `classDiagram
    class Patient {
        +UUID patientId PK
        +String fullName
        +Integer age
        +String bloodGroup
        +bookAppointment()
        +viewHistory()
    }
    class Doctor {
        +UUID doctorId PK
        +String name
        +String specialization
        +String licenseNumber
        +diagnosePatient()
        +prescribeMedication()
    }
    class Appointment {
        +UUID appointmentId PK
        +UUID patientId FK
        +UUID doctorId FK
        +DateTime scheduledAt
        +String status
        +reschedule()
    }
    class MedicalRecord {
        +UUID recordId PK
        +UUID patientId FK
        +String diagnosis
        +String prescription
        +addClinicalNotes()
    }
    class Department {
        +UUID deptId PK
        +String deptName
    }
    Department "1" -- "1..*" Doctor : employs
    Patient "1" -- "0..*" Appointment : schedules
    Doctor "1" -- "0..*" Appointment : attends
    Patient "1" -- "1..*" MedicalRecord : maintains`;
  }

  // 6. PHARMACY & DRUG STORE
  if (p.match(/pharmacy|chemist|drug|medicine|prescription/)) {
    return `classDiagram
    class Medicine {
        +String drugCode PK
        +String genericName
        +Decimal unitPrice
        +DateTime expiryDate
        +Integer stockCount
        +checkExpiry()
    }
    class Pharmacist {
        +UUID staffId PK
        +String licenseNumber
        +dispensePrescription()
    }
    class PrescriptionOrder {
        +UUID orderId PK
        +String doctorName
        +String patientName
        +DateTime issuedDate
        +verifyDrugInteractions()
    }
    class Supplier {
        +UUID supplierId PK
        +String companyName
        +supplyMedicines()
    }
    Pharmacist "1" -- "0..*" PrescriptionOrder : verifies
    PrescriptionOrder "1" *-- "1..*" Medicine : contains
    Supplier "1" -- "1..*" Medicine : supplies`;
  }

  // 7. E-COMMERCE & ONLINE STORE
  if (p.match(/ecommerce|shop|store|amazon|cart|checkout|product|retail|marketplace/)) {
    return `classDiagram
    class Customer {
        +UUID customerId PK
        +String name
        +String email UK
        +String shippingAddress
        +addToCart()
        +checkout()
    }
    class Product {
        +UUID productId PK
        +String title
        +Decimal price
        +Integer inventoryStock
        +reduceStock(qty)
    }
    class Order {
        +UUID orderId PK
        +UUID customerId FK
        +Decimal grandTotal
        +String orderStatus
        +processPayment()
    }
    class OrderItem {
        +UUID itemId PK
        +UUID orderId FK
        +UUID productId FK
        +Integer quantity
        +Decimal subtotal
    }
    class PaymentGateway {
        +UUID paymentId PK
        +UUID orderId FK
        +String provider
        +authorizePayment()
    }
    Customer "1" -- "0..*" Order : places
    Order "1" *-- "1..*" OrderItem : contains
    Product "1" <-- "0..*" OrderItem : references
    Order "1" -- "1" PaymentGateway : billed_through`;
  }

  // 8. FOOD DELIVERY & RESTAURANT (Swiggy / Zomato)
  if (p.match(/food|restaurant|swiggy|zomato|dining|cafe|bakery|menu|chef|kitchen/)) {
    return `classDiagram
    class Diner {
        +UUID dinerId PK
        +String name
        +String deliveryAddress
        +placeFoodOrder()
    }
    class Restaurant {
        +UUID restaurantId PK
        +String businessName
        +String cuisineType
        +Float rating
        +updateMenu()
    }
    class MenuItem {
        +UUID itemId PK
        +UUID restaurantId FK
        +String dishName
        +Decimal price
        +Boolean isVeg
    }
    class FoodOrder {
        +UUID orderId PK
        +UUID dinerId FK
        +UUID restaurantId FK
        +UUID deliveryPartnerId FK
        +String status
        +calculateBill()
    }
    class DeliveryRider {
        +UUID riderId PK
        +String vehicleNumber
        +String liveLocation
        +acceptDelivery()
    }
    Restaurant "1" *-- "1..*" MenuItem : offers
    Diner "1" -- "0..*" FoodOrder : places
    Restaurant "1" -- "0..*" FoodOrder : prepares
    DeliveryRider "1" -- "0..*" FoodOrder : delivers`;
  }

  // 9. RIDE SHARING & CAB BOOKING (Uber / Ola)
  if (p.match(/ride|uber|ola|cab|taxi|driver|trip|fleet|car rental/)) {
    return `classDiagram
    class Rider {
        +UUID riderId PK
        +String name
        +Float userRating
        +requestCab()
        +rateDriver()
    }
    class Driver {
        +UUID driverId PK
        +String drivingLicense UK
        +Float rating
        +Boolean isOnline
        +acceptRide()
    }
    class Cab {
        +String plateNumber PK
        +UUID driverId FK
        +String carModel
        +String color
    }
    class RideTrip {
        +UUID tripId PK
        +UUID riderId FK
        +UUID driverId FK
        +String pickupCoords
        +String dropCoords
        +Decimal surgeFare
        +computeFare()
    }
    class GPSLocation {
        +UUID pingId PK
        +UUID tripId FK
        +Float latitude
        +Float longitude
    }
    Rider "1" -- "0..*" RideTrip : requests
    Driver "1" -- "0..*" RideTrip : completes
    Driver "1" -- "1" Cab : drives
    RideTrip "1" *-- "1..*" GPSLocation : tracks`;
  }

  // 10. HOTEL & RESORT RESERVATION (Airbnb / Booking)
  if (p.match(/hotel|resort|airbnb|room|booking|lodge|hostel|guest/)) {
    return `classDiagram
    class Guest {
        +UUID guestId PK
        +String idProofNumber
        +String fullName
        +reserveRoom()
    }
    class Room {
        +String roomNumber PK
        +String roomType
        +Decimal pricePerNight
        +Boolean isClean
        +Boolean isOccupied
        +markOccupied()
    }
    class Reservation {
        +UUID bookingId PK
        +UUID guestId FK
        +String roomNumber FK
        +DateTime checkInDate
        +DateTime checkOutDate
        +Decimal totalCharge
        +confirmBooking()
    }
    class HousekeepingStaff {
        +UUID staffId PK
        +String shift
        +cleanRoom()
    }
    Guest "1" -- "0..*" Reservation : creates
    Room "1" -- "0..*" Reservation : booked_for
    HousekeepingStaff "1" -- "0..*" Room : services`;
  }

  // 11. UNIVERSITY & COLLEGE LMS
  if (p.match(/university|college|school|student|professor|course|lms|exam|attendance|academic/)) {
    return `classDiagram
    class Student {
        +String studentPRN PK
        +String fullName
        +String branch
        +Float currentGPA
        +registerCourse()
        +submitAssignment()
    }
    class Professor {
        +UUID facultyId PK
        +String name
        +String department
        +gradeExam()
        +conductLecture()
    }
    class Course {
        +String courseCode PK
        +String title
        +Integer creditHours
        +UUID facultyId FK
    }
    class Enrollment {
        +UUID enrollmentId PK
        +String studentPRN FK
        +String courseCode FK
        +Float finalGrade
        +Float attendancePct
    }
    class Assignment {
        +UUID assignmentId PK
        +String courseCode FK
        +DateTime deadline
        +Integer maxScore
    }
    Professor "1" -- "1..*" Course : instructs
    Student "1" -- "0..*" Enrollment : joins
    Course "1" -- "0..*" Enrollment : enrolls
    Course "1" *-- "1..*" Assignment : assigns`;
  }

  // 12. LIBRARY MANAGEMENT SYSTEM
  if (p.match(/library|book|borrow|catalog|librarian|isbn/)) {
    return `classDiagram
    class Book {
        +String isbn PK
        +String title
        +String author
        +String genre
        +Boolean isIssued
        +markIssued()
        +markReturned()
    }
    class Member {
        +UUID memberId PK
        +String name
        +String membershipTier
        +Integer activeBorrows
        +borrowBook()
    }
    class BorrowRecord {
        +UUID recordId PK
        +String isbn FK
        +UUID memberId FK
        +DateTime issueDate
        +DateTime dueDate
        +Decimal fineAccrued
        +calculateFine()
    }
    class Librarian {
        +UUID employeeId PK
        +String name
        +addBookToCatalog()
    }
    Member "1" -- "0..*" BorrowRecord : records
    Book "1" -- "0..*" BorrowRecord : references
    Librarian "1" -- "0..*" Book : catalogs`;
  }

  // 13. SOCIAL MEDIA PLATFORM (Instagram / Twitter / Facebook)
  if (p.match(/social|instagram|twitter|facebook|post|feed|follower|like|comment/)) {
    return `classDiagram
    class UserProfile {
        +UUID userId PK
        +String username UK
        +String bio
        +Integer followerCount
        +publishPost()
        +followUser()
    }
    class Post {
        +UUID postId PK
        +UUID authorId FK
        +String mediaUrl
        +String captionText
        +DateTime timestamp
        +incrementLikes()
    }
    class Comment {
        +UUID commentId PK
        +UUID postId FK
        +UUID authorId FK
        +String textBody
    }
    class FollowRelation {
        +UUID followId PK
        +UUID followerId FK
        +UUID followingId FK
    }
    UserProfile "1" -- "0..*" Post : publishes
    Post "1" *-- "0..*" Comment : receives
    UserProfile "1" -- "0..*" FollowRelation : participates_in`;
  }

  // 14. VIDEO & MUSIC STREAMING (Netflix / Spotify / YouTube)
  if (p.match(/streaming|netflix|spotify|youtube|video|movie|song|music|playlist/)) {
    return `classDiagram
    class Subscriber {
        +UUID subscriberId PK
        +String email
        +String subscriptionPlan
        +playMedia()
        +createPlaylist()
    }
    class MediaContent {
        +UUID contentId PK
        +String title
        +Integer durationSeconds
        +String streamUrl
        +String qualityResolution
        +streamChunk()
    }
    class Playlist {
        +UUID playlistId PK
        +UUID subscriberId FK
        +String playlistName
        +addTrack()
    }
    class PlayHistory {
        +UUID historyId PK
        +UUID subscriberId FK
        +UUID contentId FK
        +Integer playbackPosition
        +DateTime watchedAt
    }
    Subscriber "1" -- "0..*" Playlist : curates
    Playlist "1" o-- "1..*" MediaContent : contains
    Subscriber "1" -- "0..*" PlayHistory : logs`;
  }

  // 15. CHAT & MESSAGING SYSTEM (WhatsApp / Telegram / Slack)
  if (p.match(/chat|messaging|whatsapp|telegram|slack|message|channel/)) {
    return `classDiagram
    class ChatUser {
        +UUID userId PK
        +String phoneNumber UK
        +String statusMessage
        +sendMessage()
        +createGroup()
    }
    class Message {
        +UUID messageId PK
        +UUID senderId FK
        +UUID conversationId FK
        +String encryptedPayload
        +DateTime sentAt
        +Boolean isRead
        +markDelivered()
    }
    class ConversationGroup {
        +UUID conversationId PK
        +String groupTitle
        +Boolean isGroup
        +addMember()
    }
    class Attachment {
        +UUID attachmentId PK
        +UUID messageId FK
        +String fileType
        +Integer fileSizeBytes
    }
    ChatUser "1" -- "0..*" Message : transmits
    ConversationGroup "1" *-- "1..*" Message : aggregates
    Message "1" *-- "0..1" Attachment : contains`;
  }

  // 16. SUPPLY CHAIN & WAREHOUSE INVENTORY
  if (p.match(/supply chain|warehouse|logistics|inventory|shipment|cargo|procurement/)) {
    return `classDiagram
    class Warehouse {
        +String warehouseCode PK
        +String locationCity
        +Integer maxStorageUnits
        +receiveShipment()
    }
    class InventoryItem {
        +String sku PK
        +String warehouseCode FK
        +String itemName
        +Integer quantityOnHand
        +Integer reorderThreshold
        +reorderStock()
    }
    class ShipmentOrder {
        +UUID trackingNumber PK
        +String warehouseCode FK
        +String destinationAddress
        +String shippingCarrier
        +String dispatchStatus
        +updateDispatch()
    }
    class FreightCarrier {
        +UUID carrierId PK
        +String fleetType
        +assignTruck()
    }
    Warehouse "1" *-- "1..*" InventoryItem : stocks
    Warehouse "1" -- "0..*" ShipmentOrder : dispatches
    FreightCarrier "1" -- "0..*" ShipmentOrder : transports`;
  }

  // 17. REAL ESTATE & PROPERTY MANAGEMENT
  if (p.match(/real estate|property|tenant|landlord|lease|rent|apartment|house/)) {
    return `classDiagram
    class Landlord {
        +UUID landlordId PK
        +String name
        +listProperty()
    }
    class Property {
        +UUID propertyId PK
        +UUID landlordId FK
        +String address
        +Decimal monthlyRent
        +Boolean isVacant
    }
    class Tenant {
        +UUID tenantId PK
        +String name
        +String employmentDetails
        +signLease()
        +payRent()
    }
    class LeaseAgreement {
        +UUID leaseId PK
        +UUID propertyId FK
        +UUID tenantId FK
        +DateTime startDate
        +DateTime endDate
        +Decimal depositPaid
        +terminateLease()
    }
    Landlord "1" -- "1..*" Property : owns
    Tenant "1" -- "0..*" LeaseAgreement : enters_into
    Property "1" -- "0..*" LeaseAgreement : bound_by`;
  }

  // 18. GYM & FITNESS CENTER
  if (p.match(/gym|fitness|workout|trainer|membership|crossfit|exercise/)) {
    return `classDiagram
    class GymMember {
        +UUID memberId PK
        +String name
        +String membershipTier
        +DateTime expiryDate
        +checkIn()
        +bookSession()
    }
    class PersonalTrainer {
        +UUID trainerId PK
        +String name
        +String certification
        +assignWorkoutPlan()
    }
    class FitnessClass {
        +UUID classId PK
        +UUID trainerId FK
        +String className
        +Integer capacity
        +DateTime scheduleTime
    }
    class WorkoutPlan {
        +UUID planId PK
        +UUID memberId FK
        +String targetGoal
        +String exerciseList
    }
    PersonalTrainer "1" -- "0..*" FitnessClass : conducts
    GymMember "1" -- "0..*" FitnessClass : attends
    GymMember "1" -- "1" WorkoutPlan : follows`;
  }

  // 19. IOT & SMART HOME AUTOMATION
  if (p.match(/iot|smart home|sensor|actuator|device|telemetry|home automation/)) {
    return `classDiagram
    class SmartHub {
        +String hubMacAddress PK
        +String ipAddress
        +String firmwareVersion
        +discoverDevices()
        +broadcastCommand()
    }
    class SmartDevice {
        +String deviceId PK
        +String hubMacAddress FK
        +String deviceType
        +Boolean isOnline
        +togglePower()
    }
    class SensorReading {
        +UUID readingId PK
        +String deviceId FK
        +Float sensorValue
        +String unit
        +DateTime timestamp
        +publishTelemetry()
    }
    class AutomationRule {
        +UUID ruleId PK
        +String triggerCondition
        +String actionCommand
        +evaluateRule()
    }
    SmartHub "1" *-- "1..*" SmartDevice : coordinates
    SmartDevice "1" *-- "1..*" SensorReading : generates
    SmartHub "1" -- "0..*" AutomationRule : executes`;
  }

  // 20. CYBERSECURITY & IAM (Identity & Access Management)
  if (p.match(/security|cyber|iam|firewall|audit|auth|rbac|permission|role|threat/)) {
    return `classDiagram
    class EnterpriseUser {
        +UUID userId PK
        +String username UK
        +Boolean mfaEnabled
        +authenticate()
    }
    class Role {
        +UUID roleId PK
        +String roleName
        +String description
    }
    class Permission {
        +UUID permId PK
        +String resourceKey
        +String actionType
    }
    class SecurityLog {
        +UUID logId PK
        +UUID userId FK
        +String eventType
        +String ipAddress
        +String riskScore
        +raiseAlert()
    }
    EnterpriseUser "1..*" -- "1..*" Role : assigned
    Role "1..*" *-- "1..*" Permission : grants
    EnterpriseUser "1" -- "0..*" SecurityLog : traces`;
  }

  // 21. EV (ELECTRIC VEHICLE) & CHARGING NETWORK
  if (p.match(/ev|electric vehicle|charging|battery|tesla|charging station/)) {
    return `classDiagram
    class EVOwner {
        +UUID ownerId PK
        +String rfidTag UK
        +startCharging()
    }
    class ChargingStation {
        +UUID stationId PK
        +String locationCoords
        +Integer totalPorts
        +Float gridPowerKw
    }
    class ChargingPort {
        +UUID portId PK
        +UUID stationId FK
        +String connectorType
        +Boolean isAvailable
        +supplyPower()
    }
    class ChargingSession {
        +UUID sessionId PK
        +UUID portId FK
        +UUID ownerId FK
        +Float kwhConsumed
        +Decimal billingCost
        +stopSession()
    }
    ChargingStation "1" *-- "1..*" ChargingPort : contains
    EVOwner "1" -- "0..*" ChargingSession : initiates
    ChargingPort "1" -- "0..*" ChargingSession : powers`;
  }

  // 22. DYNAMIC / UNIVERSAL FALLBACK SYNTHESIZER (Handles ANY other input)
  const words = prompt.replace(/[^a-zA-Z ]/g, "").split(" ").filter(w => w.length > 3);
  const ent1 = words[0] ? words[0].charAt(0).toUpperCase() + words[0].slice(1) : "PrimaryEntity";
  const ent2 = words[1] ? words[1].charAt(0).toUpperCase() + words[1].slice(1) : "ResourceManager";
  const ent3 = words[2] ? words[2].charAt(0).toUpperCase() + words[2].slice(1) : "ActivityService";

  return `classDiagram
    class ${ent1} {
        +UUID ${ent1.toLowerCase()}Id PK
        +String name
        +String status
        +DateTime createdAt
        +process()
        +validate()
    }
    class ${ent2} {
        +UUID ${ent2.toLowerCase()}Id PK
        +UUID ${ent1.toLowerCase()}Id FK
        +Decimal allocationMetric
        +executeTask()
    }
    class ${ent3} {
        +UUID logId PK
        +UUID targetId FK
        +String logDetails
        +DateTime timestamp
        +recordLog()
    }
    class SecurityContext {
        +UUID authId PK
        +String userRole
        +Boolean isAuthorized
        +verifyAccess()
    }
    ${ent1} "1" -- "1..*" ${ent2} : controls
    ${ent2} "1" -- "0..*" ${ent3} : triggers
    SecurityContext "1" -- "1..*" ${ent1} : enforces_policy`;
}

export async function offlineChat(input: AiChatRequest, sink: ChatSink): Promise<void> {
  sink.write("meta", JSON.stringify({ mode: "offline", model: "archvision-local-v1" }));

  if (input.action === "generate" || input.action === "transform") {
    const generatedMermaid = generateCustomUml(input.message);
    const responseText = `\`\`\`mermaid\n${generatedMermaid}\n\`\`\``;
    const chunks = responseText.split("\n");
    for (const chunk of chunks) {
      sink.write("delta", chunk + "\n");
      await delay(35);
    }
    return;
  }

  if (input.action === "explain") {
    const text = `### Architectural Breakdown\n\n- **Domain Architecture:** Decoupled multi-tier service boundary ensuring high cohesion.\n- **Data Integrity:** Strict foreign key relational contracts with ACID transaction guarantees.\n- **Design Pattern:** Implements Repository, Factory, and Observer architectural patterns.`;
    for (const line of text.split("\n")) {
      sink.write("delta", line + "\n");
      await delay(25);
    }
    return;
  }

  const generalText = `I have analyzed your architecture. The diagram adheres to standard UML conventions with normalized relational schemas and clear domain boundaries.`;
  for (const word of generalText.split(" ")) {
    sink.write("delta", word + " ");
    await delay(25);
  }
}
